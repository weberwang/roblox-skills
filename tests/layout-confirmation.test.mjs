import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { inProject } from "./helpers.mjs";
import { createDecompositionFixture } from "./decomposition-fixture.mjs";
import { validateDecomposition } from "../roblox-game-workflow-control/scripts/runtime/decomposition.mjs";

/** 创建隔离的活动 V2 合同，并允许测试逐状态图片覆盖场景。 */
function v2Fixture(root, { states = ["idle"], componentCount = 1 } = {}) {
  const item = { id: "layout-test-item", candidate: "candidate-main", stageReviews: [] };
  item.stageReviews.push({ id: `${item.id}:v0`, stage: "V0", status: "complete", candidate: item.candidate,
    userMessageRef: "user-message:v0-acceptance" });
  item.stageReviews.push({ id: `${item.id}:v1`, stage: "V1", status: "complete", candidate: item.candidate,
    userMessageRef: "user-message:v1-acceptance" });
  const review = { id: `${item.id}:v2`, stage: "V2", status: "active", candidate: item.candidate,
    startedAt: "2026-10-16T00:00:00.000Z", completedAt: null };
  item.stageReviews.push(review);
  const generated = createDecompositionFixture(root, item, review, { states, componentCount });
  return { item, review, contract: JSON.parse(readFileSync(join(root, generated.path), "utf8")) };
}

/** 直接执行 V2 拆解合同校验，避免其他阶段改动干扰本专项边界测试。 */
function assertInvalid(root, item, review, contract, expected) {
  assert.throws(() => validateDecomposition(root, item, review, contract), expected);
}

test("V2 缺少任一确认记录时均不能推进", () => inProject((root) => {
  const { item, review, contract } = v2Fixture(root);
  const missingDecomposition = structuredClone(contract);
  delete missingDecomposition.decompositionConfirmation;
  assertInvalid(root, item, review, missingDecomposition, /decompositionConfirmation/);

  const missingLayout = structuredClone(contract);
  delete missingLayout.layoutConfirmation;
  assertInvalid(root, item, review, missingLayout, /layoutConfirmation/);
}));

test("两次确认必须人工接受、引用不同用户回复并使用不同 id", () => inProject((root) => {
  const { item, review, contract } = v2Fixture(root);
  const automatic = structuredClone(contract);
  automatic.layoutConfirmation.mode = "automatic";
  assertInvalid(root, item, review, automatic, /manual accepted/);

  const validAutoReference = structuredClone(contract);
  validAutoReference.decompositionConfirmation.userMessageRef = "user-message:auto-decomposition-confirmed";
  validAutoReference.layoutConfirmation.userMessageRef = "user-message:auto-layout-confirmed";
  assert.equal(validateDecomposition(root, item, review, validAutoReference), true);

  const duplicateId = structuredClone(contract);
  duplicateId.layoutConfirmation.id = duplicateId.decompositionConfirmation.id;
  assertInvalid(root, item, review, duplicateId, /必须使用不同 id/);

  const reusedReply = structuredClone(contract);
  reusedReply.layoutConfirmation.userMessageRef = reusedReply.decompositionConfirmation.userMessageRef;
  assertInvalid(root, item, review, reusedReply, /两条独立用户回复/);
}));

test("拆解和布局确认不能借用 V1 来源冻结引用或 V0/V1 阶段确认", () => inProject((root) => {
  const { item, review, contract } = v2Fixture(root, { states: ["idle", "hover"] });
  const sourceRef = contract.sourceImages[0].frozenRef;
  const v0Ref = item.stageReviews.find((entry) => entry.stage === "V0").userMessageRef;
  const v1Ref = item.stageReviews.find((entry) => entry.stage === "V1").userMessageRef;
  const cases = [
    ["decompositionConfirmation", sourceRef], ["layoutConfirmation", sourceRef],
    ["decompositionConfirmation", v0Ref], ["layoutConfirmation", v0Ref],
    ["decompositionConfirmation", v1Ref], ["layoutConfirmation", v1Ref],
  ];
  for (const [confirmationField, priorRef] of cases) {
    const reused = structuredClone(contract);
    reused[confirmationField].userMessageRef = priorRef;
    assertInvalid(root, item, review, reused, /不能复用 V1 来源冻结引用或 V0\/V1 阶段确认/);
  }
}));

test("确认、拆解预览、布局图和组件身份必须绑定当前工作项候选与状态", () => inProject((root) => {
  const { item, review, contract } = v2Fixture(root, { states: ["idle", "hover"], componentCount: 2 });
  const crossWorkItem = structuredClone(contract);
  crossWorkItem.decompositionConfirmation.workItemId = "another-work-item";
  assertInvalid(root, item, review, crossWorkItem, /当前 V2 工作项和候选/);

  const crossCandidate = structuredClone(contract);
  crossCandidate.layoutConfirmation.candidate = "candidate-other";
  assertInvalid(root, item, review, crossCandidate, /当前 V2 工作项和候选/);

  const crossPreviewState = structuredClone(contract);
  crossPreviewState.decompositionConfirmation.previewBindings[0].state = "hover";
  assertInvalid(root, item, review, crossPreviewState, /当前合同中的预览文件、来源和状态/);

  const crossLayoutState = structuredClone(contract);
  crossLayoutState.layouts[0].state = "hover";
  assertInvalid(root, item, review, crossLayoutState, /对应来源图片和状态/);

  const crossLayoutImage = structuredClone(contract);
  crossLayoutImage.layoutConfirmation.layoutBindings[0].path = crossLayoutImage.layouts[1].path;
  assertInvalid(root, item, review, crossLayoutImage, /当前布局图片、来源和状态/);

  const crossComponents = structuredClone(contract);
  crossComponents.layouts[0].componentIds = ["C1"];
  assertInvalid(root, item, review, crossComponents, /必须精确覆盖状态 idle 的全部组件身份/);

  const sourceImageReuse = structuredClone(contract);
  sourceImageReuse.layouts[0].path = sourceImageReuse.sourceImages[0].path;
  sourceImageReuse.layoutConfirmation.layoutBindings[0].path = sourceImageReuse.layouts[0].path;
  assertInvalid(root, item, review, sourceImageReuse, /不能冒用 V1 来源图或 V2 拆解预览/);

  const previewImageReuse = structuredClone(contract);
  previewImageReuse.layouts[0].path = previewImageReuse.previews[0].path;
  previewImageReuse.layoutConfirmation.layoutBindings[0].path = previewImageReuse.layouts[0].path;
  assertInvalid(root, item, review, previewImageReuse, /不能冒用 V1 来源图或 V2 拆解预览/);
}));

test("布局必须在拆解确认后生成，并在全部布局生成后独立确认", () => inProject((root) => {
  const { item, review, contract } = v2Fixture(root);
  const earlyLayout = structuredClone(contract);
  earlyLayout.layouts[0].generatedAt = earlyLayout.decompositionConfirmation.confirmedAt;
  assertInvalid(root, item, review, earlyLayout, /必须晚于前置确认或布局生成时间/);

  const reverseOrder = structuredClone(contract);
  reverseOrder.layoutConfirmation.confirmedAt = reverseOrder.layouts[0].generatedAt;
  assertInvalid(root, item, review, reverseOrder, /必须晚于前置确认或布局生成时间|必须晚于拆解确认和所有布局图片生成时间/);

  const futureLayout = structuredClone(contract);
  futureLayout.layouts[0].generatedAt = new Date(Date.now() + 60_000).toISOString();
  assertInvalid(root, item, review, futureLayout, /不能晚于当前时间/);

  const futureConfirmation = structuredClone(contract);
  futureConfirmation.layoutConfirmation.confirmedAt = new Date(Date.now() + 60_000).toISOString();
  assertInvalid(root, item, review, futureConfirmation, /不能晚于当前时间/);
}));

test("布局文件必须是独立且可读取的项目图片", () => inProject((root) => {
  const { item, review, contract } = v2Fixture(root, { states: ["idle", "hover"] });
  const missingImage = structuredClone(contract);
  missingImage.layouts[1].path = "fixtures/missing-layout.png";
  missingImage.layoutConfirmation.layoutBindings[1].path = missingImage.layouts[1].path;
  assertInvalid(root, item, review, missingImage, /布局图片文件缺失或为空/);

  const reusedImage = structuredClone(contract);
  reusedImage.layouts[1].path = reusedImage.layouts[0].path;
  reusedImage.layoutConfirmation.layoutBindings[1].path = reusedImage.layouts[1].path;
  assertInvalid(root, item, review, reusedImage, /每个状态必须使用独立布局图片文件/);
}));

test("正常的多状态合同为每个状态绑定拆解预览和布局图", () => inProject((root) => {
  const { item, review, contract } = v2Fixture(root, { states: ["idle", "hover", "pressed"], componentCount: 2 });
  assert.equal(contract.layouts.length, 3);
  assert.equal(validateDecomposition(root, item, review, contract), true);
  assert.deepEqual(new Set(contract.layouts.map((layout) => layout.state)), new Set(["idle", "hover", "pressed"]));
  assert.notEqual(contract.decompositionConfirmation.id, contract.layoutConfirmation.id);
}));
