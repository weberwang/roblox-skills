import { inflateSync } from "node:zlib";
import { statSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { projectPath } from "./io.mjs";

const IMAGE_EXTENSIONS = new Map([["png", "PNG"], ["jpg", "JPEG"], ["jpeg", "JPEG"], ["webp", "WEBP"]]);
const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const MAX_PNG_INFLATE_BYTES = 256 * 1024 * 1024;

/** 读取项目内图片并检查其基本文件结构和尺寸，不解码画面像素或判断视觉效果。 */
export function readProjectImage(repo, localPath) {
  if (typeof localPath !== "string" || !localPath.trim()) throw new Error("图片 path 必须是项目内相对路径");
  const expectedFormat = IMAGE_EXTENSIONS.get(extname(localPath).slice(1).toLowerCase());
  if (!expectedFormat) throw new Error(`图片扩展名必须是 PNG、JPG、JPEG 或 WebP：${localPath}`);
  const absolutePath = projectPath(repo, localPath);
  const info = statSync(absolutePath);
  if (!info.isFile() || info.size === 0) throw new Error(`图片文件缺失或为空：${localPath}`);
  const image = inspectImage(readFileSync(absolutePath));
  if (image.format !== expectedFormat) throw new Error(`图片扩展名与实际格式不匹配：${localPath}`);
  if (!Number.isSafeInteger(image.width) || image.width < 1 || !Number.isSafeInteger(image.height) || image.height < 1) {
    throw new Error(`图片尺寸无效：${localPath}`);
  }
  return { ...image, absolutePath };
}

/** 校验签名后转入有限的格式检查；只证明文件结构可读，不代表视觉正确。 */
function inspectImage(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return inspectPng(buffer);
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) return inspectJpeg(buffer);
  if (buffer.length >= 20 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return inspectWebp(buffer);
  }
  throw new Error("文件不是可识别的 PNG、JPEG 或 WebP 图片");
}

/** 校验 PNG 块 CRC、IHDR 合法组合、压缩扫描行长度和行过滤标记。 */
function inspectPng(buffer) {
  let offset = 8;
  let header = null;
  let idatStarted = false;
  let idatClosed = false;
  let hasImageData = false;
  let hasEnd = false;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const crcOffset = dataStart + length;
    const chunkEnd = crcOffset + 4;
    if (!/^[A-Za-z]{4}$/.test(type) || chunkEnd > buffer.length) throw new Error("PNG 块名称或长度无效");
    if (buffer.readUInt32BE(crcOffset) !== crc32(buffer, offset + 4, crcOffset)) throw new Error(`PNG ${type} 块 CRC 不匹配`);
    if (!header) {
      if (type !== "IHDR" || length !== 13) throw new Error("PNG 首块必须是完整 IHDR 尺寸块");
      header = readPngHeader(buffer.subarray(dataStart, crcOffset));
    } else if (type === "IHDR") {
      throw new Error("PNG 不能重复声明 IHDR");
    }
    if (type === "IDAT") {
      if (idatClosed) throw new Error("PNG IDAT 块必须连续");
      // 即使首个 IDAT 为空，也视为序列已开始，避免在 ancillary 块后重新接续。
      idatStarted = true;
      if (length > 0) hasImageData = true;
      idat.push(buffer.subarray(dataStart, crcOffset));
    } else if (idatStarted && type !== "IEND") {
      idatClosed = true;
    }
    if (type === "IEND") {
      if (length !== 0 || chunkEnd !== buffer.length || !hasImageData) throw new Error("PNG IEND 必须为空、位于文件末尾且跟随图像数据");
      hasEnd = true;
      break;
    }
    offset = chunkEnd;
  }
  if (!header || !hasImageData || !hasEnd) throw new Error("PNG 必须包含完整 IHDR、非空 IDAT 和 IEND");
  validatePngScanlines(Buffer.concat(idat), header);
  return { format: "PNG", width: header.width, height: header.height };
}

/** 解析并核验 IHDR 的尺寸、颜色类型、位深、压缩、过滤与隔行字段。 */
function readPngHeader(data) {
  const width = data.readUInt32BE(0);
  const height = data.readUInt32BE(4);
  const bitDepth = data[8];
  const colorType = data[9];
  const compression = data[10];
  const filter = data[11];
  const interlace = data[12];
  const channelCounts = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]);
  const legalDepths = new Map([[0, [1, 2, 4, 8, 16]], [2, [8, 16]], [3, [1, 2, 4, 8]], [4, [8, 16]], [6, [8, 16]]]);
  if (width < 1 || height < 1 || !channelCounts.has(colorType) || !legalDepths.get(colorType).includes(bitDepth)
      || compression !== 0 || filter !== 0 || ![0, 1].includes(interlace)) {
    throw new Error("PNG IHDR 的尺寸、颜色/位深、压缩、过滤或隔行组合不合法");
  }
  return { width, height, bitDepth, channels: channelCounts.get(colorType), interlace };
}

/** 计算普通扫描或 Adam7 的精确解压上限，并核验每行过滤字节。 */
function validatePngScanlines(compressed, header) {
  const passes = header.interlace === 0
    ? [[0, 0, 1, 1]]
    : [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
  const rows = [];
  let expectedLength = 0;
  const bitsPerPixel = header.channels * header.bitDepth;
  for (const [startX, startY, stepX, stepY] of passes) {
    const passWidth = Math.max(0, Math.ceil((header.width - startX) / stepX));
    const passHeight = Math.max(0, Math.ceil((header.height - startY) / stepY));
    if (passWidth === 0 || passHeight === 0) continue;
    const rowBytes = Math.ceil((passWidth * bitsPerPixel) / 8);
    const passLength = passHeight * (rowBytes + 1);
    if (!Number.isSafeInteger(rowBytes) || !Number.isSafeInteger(passLength)) throw new Error("PNG 扫描行尺寸超出安全计算范围");
    rows.push({ count: passHeight, rowBytes });
    expectedLength += passLength;
    if (!Number.isSafeInteger(expectedLength)) throw new Error("PNG 解压扫描数据超出安全计算范围");
    if (expectedLength > MAX_PNG_INFLATE_BYTES) throw new Error("PNG 解压扫描数据超过 256 MiB 本地文件检查预算");
  }
  let decoded;
  try {
    // maxOutputLength 以 IHDR 计算的精确长度为上界，避免压缩炸弹无限膨胀。
    decoded = inflateSync(compressed, { maxOutputLength: expectedLength + 1 });
  } catch (error) {
    throw new Error(`PNG IDAT zlib 流无法按预期解压：${error.message}`);
  }
  if (decoded.length !== expectedLength) throw new Error("PNG 解压扫描行总长度与 IHDR 不匹配");
  let offset = 0;
  for (const pass of rows) {
    for (let row = 0; row < pass.count; row++) {
      if (decoded[offset] > 4) throw new Error("PNG 扫描行 filter 类型必须在 0–4 范围内");
      offset += pass.rowBytes + 1;
    }
  }
}

/** 在 JPEG 扫描前核验帧尺寸、量化表、Huffman/算术表和结束标记。 */
function inspectJpeg(buffer) {
  let offset = 2;
  let dimensions = null;
  let hasQuantizationTable = false;
  let hasCodingTable = false;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) throw new Error("JPEG 标记结构不完整");
    while (offset < buffer.length && buffer[offset] === 0xff) offset++;
    if (offset >= buffer.length) break;
    const marker = buffer[offset++];
    if (marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) throw new Error("JPEG 标记段长度无效");
    const dataStart = offset + 2;
    const segmentEnd = offset + segmentLength;
    if (marker === 0xdb) {
      validateJpegQuantizationTables(buffer, dataStart, segmentEnd);
      hasQuantizationTable = true;
    } else if (marker === 0xc4) {
      validateJpegHuffmanTables(buffer, dataStart, segmentEnd);
      hasCodingTable = true;
    } else if (marker === 0xcc) {
      validateJpegArithmeticTables(buffer, dataStart, segmentEnd);
      hasCodingTable = true;
    }
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 8) throw new Error("JPEG 帧尺寸段不完整");
      dimensions = { format: "JPEG", height: buffer.readUInt16BE(dataStart + 1), width: buffer.readUInt16BE(dataStart + 3) };
    }
    if (marker === 0xda) {
      const scanStart = offset + segmentLength;
      if (!dimensions || !hasQuantizationTable || !hasCodingTable || scanStart >= buffer.length - 2
          || buffer[buffer.length - 2] !== 0xff || buffer[buffer.length - 1] !== 0xd9) {
        throw new Error("JPEG 扫描前必须有帧尺寸、DQT 与 DHT/DAC，且扫描数据非空并以 EOI 结束");
      }
      return dimensions;
    }
    offset += segmentLength;
  }
  throw new Error("JPEG 缺少可读帧尺寸、编码表或扫描数据");
}

/** 校验 DQT 至少含一个完整表，避免只有标记头的 JPEG 伪文件通过。 */
function validateJpegQuantizationTables(buffer, start, end) {
  let offset = start;
  let tableCount = 0;
  while (offset < end) {
    const info = buffer[offset++];
    const precision = info >> 4;
    const tableId = info & 0x0f;
    if (precision > 1 || tableId > 3) throw new Error("JPEG DQT 表头无效");
    const coefficientBytes = precision === 0 ? 64 : 128;
    if (offset + coefficientBytes > end) throw new Error("JPEG DQT 表数据不完整");
    offset += coefficientBytes;
    tableCount++;
  }
  if (tableCount === 0) throw new Error("JPEG DQT 不得为空");
}

/** 校验 DHT 的码长计数和符号边界，不展开或解码霍夫曼码流。 */
function validateJpegHuffmanTables(buffer, start, end) {
  let offset = start;
  let tableCount = 0;
  while (offset < end) {
    const info = buffer[offset++];
    if ((info >> 4) > 1 || (info & 0x0f) > 3 || offset + 16 > end) throw new Error("JPEG DHT 表头或码长计数不完整");
    let symbolCount = 0;
    for (let index = 0; index < 16; index++) symbolCount += buffer[offset + index];
    offset += 16;
    if (symbolCount === 0 || symbolCount > 256 || offset + symbolCount > end) throw new Error("JPEG DHT 符号表不完整");
    offset += symbolCount;
    tableCount++;
  }
  if (tableCount === 0) throw new Error("JPEG DHT 不得为空");
}

/** 校验 DAC 至少包含完整表对；不执行算术熵解码。 */
function validateJpegArithmeticTables(buffer, start, end) {
  if (end - start < 2 || (end - start) % 2 !== 0) throw new Error("JPEG DAC 表数据不完整");
  for (let offset = start; offset < end; offset += 2) {
    const info = buffer[offset];
    if ((info >> 4) > 1 || (info & 0x0f) > 3) throw new Error("JPEG DAC 表头无效");
  }
}

/** 读取 WebP RIFF 块，确认尺寸头之外存在有效 VP8/VP8L 数据负载。 */
function inspectWebp(buffer) {
  const declaredEnd = buffer.readUInt32LE(4) + 8;
  if (declaredEnd !== buffer.length) throw new Error("WebP RIFF 声明长度与文件不匹配");
  let offset = 12;
  let dimensions = null;
  let hasImagePayload = false;
  while (offset < declaredEnd) {
    if (offset + 8 > declaredEnd) throw new Error("WebP chunk 头部不完整");
    const type = buffer.toString("ascii", offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const nextChunk = dataEnd + (length % 2);
    if (dataEnd > declaredEnd || nextChunk > declaredEnd) throw new Error("WebP chunk 长度超出 RIFF 边界");
    if (type === "VP8X" && length === 10) {
      dimensions = { format: "WEBP", width: 1 + buffer.readUIntLE(dataStart + 4, 3), height: 1 + buffer.readUIntLE(dataStart + 7, 3) };
    } else if (type === "VP8 " && length > 10 && buffer.toString("hex", dataStart + 3, dataStart + 6) === "9d012a") {
      const firstPartitionLength = (buffer[dataStart] >> 5) | (buffer[dataStart + 1] << 3) | (buffer[dataStart + 2] << 11);
      if (firstPartitionLength < 1 || firstPartitionLength > length - 10) throw new Error("WebP VP8 首分区长度无效");
      dimensions ??= { format: "WEBP", width: buffer.readUInt16LE(dataStart + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataStart + 8) & 0x3fff };
      hasImagePayload = true;
    } else if (type === "VP8L" && length > 5 && buffer[dataStart] === 0x2f) {
      dimensions ??= { format: "WEBP", width: 1 + buffer[dataStart + 1] + ((buffer[dataStart + 2] & 0x3f) << 8),
        height: 1 + (buffer[dataStart + 2] >> 6) + (buffer[dataStart + 3] << 2) + ((buffer[dataStart + 4] & 0x0f) << 10) };
      hasImagePayload = true;
    }
    offset = nextChunk;
  }
  if (!dimensions || !hasImagePayload) throw new Error("WebP 必须包含可读尺寸和非空 VP8/VP8L 图像数据");
  return dimensions;
}

/** 计算 PNG CRC32，覆盖块类型和数据，不把文件内容解释为像素。 */
function crc32(buffer, start, end) {
  let crc = 0xffffffff;
  for (let index = start; index < end; index++) {
    crc ^= buffer[index];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
