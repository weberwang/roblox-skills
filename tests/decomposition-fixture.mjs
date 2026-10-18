import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { RESTORATION_ASPECTS } from "../roblox-game-workflow-control/scripts/runtime/restoration.mjs";

const TEST_JPEG_BASE64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAYACADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDPooor7E+VCiiigAooooAKKKKAP//Z";
const TEST_WEBP_BASE64 = "UklGRkgAAABXRUJQVlA4IDwAAABwAwCdASogABgAPm00lUekIyIhKAgAgA2JZQDIEoB+AABBlBAA/t4Sf/xu3GG/Bd/+FXxuQsiaAnYAAAA=";

/** 生成测试专用的 CRC32，确保临时 PNG 本身具备标准块校验和。 */
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** 组装标准 PNG 块，供隔离目录内的结构测试使用。 */
function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, crcInput, crc]);
}

/** 写入可读尺寸的测试 PNG；像素内容没有游戏资产或视觉验收含义。 */
export function writeTestPng(root, localPath, width = 32, height = 24) {
  if (!Number.isSafeInteger(width) || width < 1 || width > 1024 || !Number.isSafeInteger(height) || height < 1 || height > 1024) {
    throw new Error("测试 PNG 尺寸必须处于 1–1024 范围");
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  const absolutePath = join(root, localPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, png);
  return png;
}

/** 写入有效 Adam7 扫描行夹具，验证交错图像的七个 pass 长度计算。 */
export function writeAdam7TestPng(root, localPath, width = 32, height = 24) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[12] = 1;
  const passes = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
  const rows = [];
  for (const [startX, startY, stepX, stepY] of passes) {
    const passWidth = Math.max(0, Math.ceil((width - startX) / stepX));
    const passHeight = Math.max(0, Math.ceil((height - startY) / stepY));
    if (passWidth === 0 || passHeight === 0) continue;
    for (let row = 0; row < passHeight; row++) rows.push(Buffer.alloc(passWidth * 4 + 1));
  }
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  writeFixture(root, localPath, png);
  return png;
}

/** 写入一次性由 Pillow 生成的 32x24 解码有效 JPEG；不对内容做视觉判断。 */
export function writeTestJpeg(root, localPath) {
  const jpeg = Buffer.from(TEST_JPEG_BASE64, "base64");
  writeFixture(root, localPath, jpeg);
  return jpeg;
}

/** 写入一次性由 Pillow 生成的 32x24 解码有效 WebP；不对内容做视觉判断。 */
export function writeTestWebp(root, localPath) {
  const webp = Buffer.from(TEST_WEBP_BASE64, "base64");
  writeFixture(root, localPath, webp);
  return webp;
}

/** 写出 CRC 正确但 IDAT、CRC 或扫描行可控的 PNG 负例夹具。 */
export function writeMalformedPng(root, localPath, { idat = Buffer.from([0xff]), badIdatCrc = false, wrongScanlineLength = false,
  invalidHeader = false } = {}) {
  const width = 32;
  const height = 24;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  if (invalidHeader) ihdr[8] = 4;
  const scanlines = Buffer.alloc(wrongScanlineLength ? 1 : (width * 4 + 1) * height);
  const idatPayload = wrongScanlineLength ? deflateSync(scanlines) : idat;
  const idatChunk = pngChunk("IDAT", idatPayload);
  if (badIdatCrc) idatChunk[idatChunk.length - 1] ^= 0x01;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    idatChunk,
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  writeFixture(root, localPath, png);
  return png;
}

/** 写入缺少编码表的 JPEG 伪结构，确保仅有帧头和扫描段不能作为正例。 */
export function writeJpegWithoutTables(root, localPath) {
  const frame = Buffer.from([8, 0, 24, 0, 32, 1, 1, 0x11, 0]);
  const frameLength = Buffer.alloc(2);
  frameLength.writeUInt16BE(frame.length + 2);
  const scan = Buffer.from([1, 1, 0, 0, 0x3f, 0]);
  const scanLength = Buffer.alloc(2);
  scanLength.writeUInt16BE(scan.length + 2);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xc0]), frameLength, frame,
    Buffer.from([0xff, 0xda]), scanLength, scan, Buffer.from([0x00, 0xff, 0xd9])]);
  writeFixture(root, localPath, jpeg);
  return jpeg;
}

/** 写入只有 VP8X 尺寸扩展头、没有 VP8/VP8L 影像负载的 WebP 伪结构。 */
export function writeWebpHeaderOnly(root, localPath) {
  const vp8x = Buffer.alloc(10);
  vp8x.writeUIntLE(31, 4, 3);
  vp8x.writeUIntLE(23, 7, 3);
  const chunkLength = Buffer.alloc(4);
  chunkLength.writeUInt32LE(vp8x.length);
  const chunk = Buffer.concat([Buffer.from("VP8X", "ascii"), chunkLength, vp8x]);
  const riffLength = Buffer.alloc(4);
  riffLength.writeUInt32LE(4 + chunk.length);
  const webp = Buffer.concat([Buffer.from("RIFF", "ascii"), riffLength, Buffer.from("WEBP", "ascii"), chunk]);
  writeFixture(root, localPath, webp);
  return webp;
}

/** 以隔离项目根为基准写入测试图片，集中处理父目录创建。 */
function writeFixture(root, localPath, content) {
  const absolutePath = join(root, localPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

/** 生成与当前 V1 review 和 V2 review 绑定的合同夹具，不代表实际游戏事实。 */
export function createDecompositionFixture(root, item, review, { states = ["idle"], componentCount = 1 } = {}) {
  const v1 = item.stageReviews.find((entry) => entry?.stage === "V1");
  if (!v1) throw new Error("测试拆解合同需要先建立 V1 review 夹具");
  const sourceImages = states.map((state, index) => {
    const id = `source-${index + 1}`;
    const path = `fixtures/${id}.png`;
    writeTestPng(root, path);
    return { id, stageReviewId: v1.id, candidate: v1.candidate, version: `v1-${index + 1}`, path,
      width: 32, height: 24, state, frozenRef: `test-only ${v1.id} ${state} source` };
  });
  const components = Array.from({ length: componentCount }, (_, index) => ({
    componentId: `C${index + 1}`,
    elementIndex: index + 1,
    purpose: `测试组件 ${index + 1} 用途`,
    visualFeatures: `测试组件 ${index + 1} 的视觉特征`,
    productionRoute: "ROBLOX_NATIVE",
    sourceRef: sourceImages[0].id,
    consumerNodeId: `planned-consumer-${index + 1}`,
    parentId: null,
    group: null,
    assembly: `测试装配边界 ${index + 1}`,
    layoutRef: `测试布局 ${index + 1}`,
    productionBoundary: `测试生产边界 ${index + 1}`,
    owner: "测试负责人",
    states: [...states],
  }));
  const previews = sourceImages.map((source, sourceIndex) => {
    const path = `fixtures/preview-${sourceIndex + 1}.png`;
    writeTestPng(root, path);
    return { path, sourceImageId: source.id, presentedRef: `test-only preview for ${source.state}`,
      annotations: components.map((component) => ({ componentId: component.componentId, label: `测试标注 ${component.componentId}`,
        bounds: { x: 1, y: 1, width: 12, height: 10 } })) };
  });
  const views = sourceImages.map((source, index) => ({
    id: `view-${index + 1}`,
    sourceImageId: source.id,
    purpose: `测试目标视图 ${source.state}`,
    camera: "测试相机机位，未声明实测坐标",
    fov: "未知，测试夹具未测量",
    viewport: "未知，测试夹具未测量",
    anchors: "测试锚点记录，未声明实测位置",
  }));
  const requirements = sourceImages.flatMap((source, sourceIndex) => RESTORATION_ASPECTS.map((aspect, aspectIndex) => ({
    id: `R${sourceIndex + 1}-${aspectIndex + 1}`,
    aspect,
    sourceImageId: source.id,
    componentIds: components.map((component) => component.componentId),
    target: {
      status: "unknown",
      value: aspect === "surface" ? "水面/岸沿表现未知" : `测试夹具未声明 ${aspect} 的目标值`,
      basis: "测试夹具未提供实际测量，只验证显式未知状态的合同结构",
    },
    productionMethod: `测试生产方法记录 ${aspect}`,
    consumer: "测试消费者节点，不代表实际游戏绑定",
    verification: "测试验证方法记录，不表示已通过视觉检查",
    flexibility: "fixed",
    adjustmentReason: "测试约束不允许玩法调整",
  })));
  const restoration = {
    views,
    requirements,
    samplePlan: {
      viewId: views[0].id,
      componentIds: components.map((component) => component.componentId),
      requirementIds: requirements.map((requirement) => requirement.id),
      combination: "测试视图中的局部组合样板计划；未发生显示检查或接受",
    },
  };
  const contract = { version: 1, workItemId: item.id, candidate: review.candidate, sourceImages, components, previews, restoration,
    coverage: { allSignificantElementsMapped: true, exclusions: [] } };
  const path = "fixtures/decomposition.json";
  const absolutePath = join(root, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(contract, null, 2)}\n`);
  return { path, contract };
}
