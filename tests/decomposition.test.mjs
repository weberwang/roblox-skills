import assert from "node:assert/strict";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fixture, inProject } from "./helpers.mjs";
import { createDecompositionFixture, writeAdam7TestPng, writeJpegWithoutTables, writeMalformedPng,
  writeTestJpeg, writeTestPng, writeTestWebp, writeWebpHeaderOnly } from "./decomposition-fixture.mjs";
import { stageStatus, advanceStage } from "../roblox-game-workflow-control/scripts/runtime/stage-operations.mjs";
import { createWorkItem } from "../roblox-game-workflow-control/scripts/workflow-control.mjs";

/** 将完整本地夹具收窄至 V2，保留已完成的 V0/V1 来源链。 */
function v2Fixture(root, options = {}) {
  const item = fixture(root, "SCENE");
  item.stageReviews = item.stageReviews.slice(0, 3);
  item.stage = "V2";
  if (options.resetVisualReview) item.visualReview = createWorkItem("visual-test", "测试视觉隔离", "SCENE").visualReview;
  const review = item.stageReviews.at(-1);
  if (options.componentCount) {
    review.decompositionRef = createDecompositionFixture(root, item, review, {
      componentCount: options.componentCount,
      states: options.states,
    }).path;
  }
  return { item, review, contract: JSON.parse(readFileSync(join(root, review.decompositionRef), "utf8")) };
}

/** 将变体合同放入项目内并绑定当前 V2 review，避免测试越过真实路径校验。 */
function bindContract(root, review, contract, name = "variant") {
  const path = `fixtures/${name}.json`;
  writeFileSync(join(root, path), `${JSON.stringify(contract, null, 2)}\n`);
  review.decompositionRef = path;
}

/** 测试变更预览路径时同步所有确认绑定，避免制造非目标的身份漂移。 */
function rebindPreview(contract, index) {
  const preview = contract.previews[index];
  const source = contract.sourceImages.find((entry) => entry.id === preview.sourceImageId);
  contract.decompositionConfirmation.previewBindings[index] = { path: preview.path, sourceImageId: preview.sourceImageId, state: source.state };
  for (const layout of contract.layouts.filter((entry) => entry.sourceImageId === preview.sourceImageId)) layout.previewPath = preview.path;
  for (const binding of contract.layoutConfirmation.layoutBindings.filter((entry) => entry.sourceImageId === preview.sourceImageId)) {
    binding.previewPath = preview.path;
  }
}

test("有效 V2 标注合同允许按既有策略进入 V3，且不会改写人工视觉结果", () => inProject((root) => {
  const { item } = v2Fixture(root, { resetVisualReview: true });
  const before = JSON.stringify(item.visualReview);
  const status = stageStatus(item, root);
  assert.equal(status.valid, true, status.errors.join("; "));
  assert.equal(status.canAdvance, true);
  assert.equal(JSON.stringify(item.visualReview), before);
  assert.ok(item.visualReview.scenarios.every((scenario) => scenario.visual.result === "NOT_RUN"));
  assert.equal(advanceStage(item, root).stage, "V3");
}));

test("V2 还原合同要求完整机位、十项维度、来源映射和组合样板计划", () => inProject((root) => {
  const { item, review, contract } = v2Fixture(root, { componentCount: 2, states: ["idle", "hover"] });
  assert.equal(contract.restoration.requirements[0].target.status, "unknown");
  assert.equal(stageStatus(item, root).valid, true, "显式 unknown 是有效记录，且不声称已测量");

  const missingStandard = structuredClone(contract);
  delete missingStandard.restoration;
  bindContract(root, review, missingStandard, "missing-restoration");
  assert.match(stageStatus(item, root).errors.join(" "), /必须提供 restoration 还原标准对象/);

  const missingViewField = structuredClone(contract);
  missingViewField.restoration.views[0].fov = " ";
  bindContract(root, review, missingViewField, "missing-view-field");
  assert.match(stageStatus(item, root).errors.join(" "), /views\[0\]\.fov 必须是非空文本/);

  const missingAspect = structuredClone(contract);
  const omittedAspectIds = new Set(missingAspect.restoration.requirements.filter((entry) => entry.aspect === "silhouette").map((entry) => entry.id));
  missingAspect.restoration.requirements = missingAspect.restoration.requirements.filter((entry) => !omittedAspectIds.has(entry.id));
  missingAspect.restoration.samplePlan.requirementIds = missingAspect.restoration.samplePlan.requirementIds.filter((id) => !omittedAspectIds.has(id));
  bindContract(root, review, missingAspect, "missing-aspect");
  assert.match(stageStatus(item, root).errors.join(" "), /缺少视觉维度：silhouette/);

  const unmappedSampleComponent = structuredClone(contract);
  unmappedSampleComponent.restoration.samplePlan.componentIds = ["C1"];
  bindContract(root, review, unmappedSampleComponent, "unmapped-sample-component");
  assert.match(stageStatus(item, root).errors.join(" "), /样板组件未覆盖要求 .* 所需组件 C2/);

  const missingSourceRequirement = structuredClone(contract);
  const secondSourceId = missingSourceRequirement.sourceImages[1].id;
  const secondSourceRequirementIds = new Set(missingSourceRequirement.restoration.requirements
    .filter((entry) => entry.sourceImageId === secondSourceId).map((entry) => entry.id));
  missingSourceRequirement.restoration.requirements = missingSourceRequirement.restoration.requirements
    .filter((entry) => !secondSourceRequirementIds.has(entry.id));
  missingSourceRequirement.restoration.samplePlan.requirementIds = missingSourceRequirement.restoration.samplePlan.requirementIds
    .filter((id) => !secondSourceRequirementIds.has(id));
  bindContract(root, review, missingSourceRequirement, "missing-source-requirement");
  assert.match(stageStatus(item, root).errors.join(" "), /来源图片缺少还原要求/);
}));

test("测量目标必须保留依据记录，unknown 的数值槽必须使用文本", () => inProject((root) => {
  const { item, review, contract } = v2Fixture(root);
  contract.restoration.requirements[0].target = { status: "measured", value: "12 px", basis: " " };
  bindContract(root, review, contract, "measured-without-basis");
  assert.match(stageStatus(item, root).errors.join(" "), /target\.basis 必须是非空文本/);

  contract.restoration.requirements[0].target = { status: "unknown", value: 12, basis: "尚未测量" };
  bindContract(root, review, contract, "unknown-numeric-value");
  assert.match(stageStatus(item, root).errors.join(" "), /target\.value 必须是非空文本/);
}));

test("源图与标注预览支持可解码的固定 JPEG 与 WebP 夹具", () => inProject((root) => {
  const { item, review, contract } = v2Fixture(root);
  for (const [extension, writeImage] of [["jpg", writeTestJpeg], ["webp", writeTestWebp]]) {
    const candidate = structuredClone(contract);
    candidate.sourceImages[0].path = `fixtures/source.${extension}`;
    candidate.previews[0].path = `fixtures/preview.${extension}`;
    writeImage(root, candidate.sourceImages[0].path);
    writeImage(root, candidate.previews[0].path);
    rebindPreview(candidate, 0);
    bindContract(root, review, candidate, `valid-${extension}`);
    const status = stageStatus(item, root);
    assert.equal(status.valid, true, `${extension}: ${status.errors.join("; ")}`);
  }
}));

test("WebP 尺寸头没有 VP8/VP8L 影像负载时不能通过", () => inProject((root) => {
  const { item, review, contract } = v2Fixture(root);
  contract.sourceImages[0].path = "fixtures/header-only.webp";
  writeWebpHeaderOnly(root, contract.sourceImages[0].path);
  bindContract(root, review, contract, "header-only-webp");
  assert.match(stageStatus(item, root).errors.join(" "), /WebP 必须包含可读尺寸和非空 VP8\/VP8L 图像数据/);
}));

test("JPEG 缺少 DQT 与 DHT/DAC 编码表时不能通过", () => inProject((root) => {
  const { item, review, contract } = v2Fixture(root);
  contract.sourceImages[0].path = "fixtures/missing-tables.jpg";
  writeJpegWithoutTables(root, contract.sourceImages[0].path);
  bindContract(root, review, contract, "missing-jpeg-tables");
  assert.match(stageStatus(item, root).errors.join(" "), /DQT 与 DHT\/DAC/);
}));

test("PNG 拒绝垃圾 IDAT、CRC 错误和错误解压长度，同时接受 Adam7 结构", () => inProject((root) => {
  const { item, review, contract } = v2Fixture(root);
  const cases = [
    ["junk-idat", { idat: Buffer.from([0x01]) }, /zlib 流无法按预期解压/],
    ["bad-crc", { badIdatCrc: true }, /IDAT 块 CRC 不匹配/],
    ["wrong-row-length", { wrongScanlineLength: true }, /扫描行总长度与 IHDR 不匹配/],
    ["invalid-header", { invalidHeader: true }, /颜色\/位深/],
  ];
  for (const [name, options, expectedError] of cases) {
    const candidate = structuredClone(contract);
    candidate.sourceImages[0].path = `fixtures/${name}.png`;
    writeMalformedPng(root, candidate.sourceImages[0].path, options);
    bindContract(root, review, candidate, name);
    assert.match(stageStatus(item, root).errors.join(" "), expectedError, name);
  }

  const valid = structuredClone(contract);
  valid.sourceImages[0].path = "fixtures/adam7.png";
  writeAdam7TestPng(root, valid.sourceImages[0].path);
  bindContract(root, review, valid, "valid-adam7");
  assert.equal(stageStatus(item, root).valid, true);
}));

test("拆解合同必须来自本项已完成的 V1 review 和冻结候选", () => inProject((root) => {
  const { item, review, contract } = v2Fixture(root);
  contract.sourceImages[0].stageReviewId = "other-work-item:v1";
  bindContract(root, review, contract);
  const status = stageStatus(item, root);
  assert.equal(status.valid, false);
  assert.match(status.errors.join(" "), /已完成的 V1 review/);
}));

test("每个组件状态都必须在对应来源预览中标注且边界在图内", () => inProject((root) => {
  const { item, review, contract } = v2Fixture(root);
  contract.previews[0].annotations = [];
  bindContract(root, review, contract, "empty-preview");
  assert.match(stageStatus(item, root).errors.join(" "), /annotations 必须是非空数组/);

  const expanded = createDecompositionFixture(root, item, review, { states: ["idle", "hover"], componentCount: 2 });
  expanded.contract.previews[1].annotations = expanded.contract.previews[1].annotations.filter((entry) => entry.componentId === "C2");
  bindContract(root, review, expanded.contract, "missing-state-annotation");
  assert.match(stageStatus(item, root).errors.join(" "), /C1 在状态 hover 的来源预览中缺少标注/);

  expanded.contract.components[0].states = ["hover"];
  bindContract(root, review, expanded.contract, "wrong-state-annotation");
  assert.match(stageStatus(item, root).errors.join(" "), /未声明来源状态 idle/);

  contract.components[0].states = ["idle"];
  contract.previews[0].annotations = [{ componentId: "C1", label: "测试标注", bounds: { x: 0, y: 0, width: 33, height: 1 } }];
  bindContract(root, review, contract, "out-of-bounds");
  assert.match(stageStatus(item, root).errors.join(" "), /超出来源图边界/);
}));

test("拆解组件编号唯一且 parentId 不得悬空或成环", () => inProject((root) => {
  const { item, review, contract } = v2Fixture(root, { componentCount: 2 });
  contract.components[1].elementIndex = contract.components[0].elementIndex;
  bindContract(root, review, contract, "duplicate-index");
  assert.match(stageStatus(item, root).errors.join(" "), /elementIndex 必须稳定且唯一/);

  contract.components[1].elementIndex = 2;
  contract.components[0].parentId = "C2";
  contract.components[1].parentId = "C1";
  bindContract(root, review, contract, "parent-cycle");
  assert.match(stageStatus(item, root).errors.join(" "), /parentId 存在循环/);
}));

test("拆解来源图片拒绝缺失、文本伪装、路径穿越和目录联接", () => inProject((root) => {
  const { item, review, contract } = v2Fixture(root);
  contract.sourceImages[0].path = "fixtures/missing.png";
  bindContract(root, review, contract, "missing-image");
  assert.match(stageStatus(item, root).errors.join(" "), /拆解合同无效/);

  mkdirSync(join(root, "fixtures"), { recursive: true });
  writeFileSync(join(root, "fixtures", "fake.png"), "这不是图片");
  contract.sourceImages[0].path = "fixtures/fake.png";
  bindContract(root, review, contract, "fake-image");
  assert.match(stageStatus(item, root).errors.join(" "), /不是可识别的 PNG/);

  const truncated = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(truncated, 0);
  truncated.writeUInt32BE(13, 8);
  truncated.write("IHDR", 12, "ascii");
  writeFileSync(join(root, "fixtures", "truncated.png"), truncated);
  contract.sourceImages[0].path = "fixtures/truncated.png";
  bindContract(root, review, contract, "truncated-image");
  assert.match(stageStatus(item, root).errors.join(" "), /PNG 块名称或长度无效|PNG 块长度超出文件|必须包含完整 IHDR、非空 IDAT 和 IEND/);

  contract.sourceImages[0].path = "../outside.png";
  bindContract(root, review, contract, "path-traversal");
  assert.match(stageStatus(item, root).errors.join(" "), /项目内相对路径/);

  writeTestPng(root, "fixtures/linked.png");
  symlinkSync(join(root, "fixtures"), join(root, "fixture-link"), process.platform === "win32" ? "junction" : "dir");
  contract.sourceImages[0].path = "fixture-link/linked.png";
  bindContract(root, review, contract, "junction");
  assert.match(stageStatus(item, root).errors.join(" "), /拒绝链接路径/);
}));

test("预览不能覆盖任一冻结来源图", () => inProject((root) => {
  const { item, review, contract } = v2Fixture(root);
  const expanded = createDecompositionFixture(root, item, review, { states: ["idle", "hover"] });
  expanded.contract.previews[0].path = expanded.contract.sourceImages[1].path;
  bindContract(root, review, expanded.contract, "source-overwrite");
  assert.match(stageStatus(item, root).errors.join(" "), /不能覆盖任何 V1 原图/);
}));

test("改变无关当前 candidate 不使已完成 V2 的来源合同失效", () => inProject((root) => {
  const { item, review, contract } = v2Fixture(root);
  assert.equal(contract.candidate, review.candidate);
  item.candidate = "candidate-next";
  const status = stageStatus(item, root);
  assert.equal(status.valid, true, status.errors.join("; "));
  assert.equal(review.candidate, contract.candidate);
}));
