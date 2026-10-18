import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createWorkItem } from "../roblox-game-workflow-control/scripts/workflow-control.mjs";
import { createStageReview, STAGE_DELIVERABLES } from "../roblox-game-workflow-control/scripts/runtime/stages.mjs";
import { advanceStage, completeCurrentStage } from "../roblox-game-workflow-control/scripts/runtime/stage-operations.mjs";
import { createDecompositionFixture } from "./decomposition-fixture.mjs";
import { createSampleFixture } from "./sample-fixture.mjs";

/** 在具名隔离目录中执行测试，清理前验证最终绝对路径的归属。 */
export function inProject(callback) {
  const root = mkdtempSync(join(tmpdir(), "roblox-skills-test-"));
  try { return callback(root); } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(root.startsWith(join(tmpdir(), "roblox-skills-test-")));
    rmSync(root, { recursive: true, force: true });
  }
}

/** 构造有真实本地产物的测试记录，不连接 Studio，也不声称游戏运行通过。 */
export function fixture(root, type = "PROJECT") {
  let item = createWorkItem("test-loop", "测试用交付记录", type);
  item.target.studioId = "test-studio";
  item.target.placeId = 0;
  item.target.universeId = 0;
  item.state = "validating";
  item.scope.files = ["src/main.luau"];
  item.implementation = {
    owner: "测试负责人", units: [{ id: "main", kind: "MODULE", dependsOn: [], owner: "测试负责人", files: ["src/main.luau"], instances: [], status: "complete" }],
    verification: item.requiredEvidence.map((type) => ({ id: type, description: "仅测试本地记录校验", evidenceType: type })), stopConditions: ["不连接 Studio"],
  };
  if (type === "DISPLAY_LAYER") item.hostSceneId = "main-scene";
  mkdirSync(join(root, "evidence"), { recursive: true });
  for (const evidenceType of item.requiredEvidence) {
    const path = `evidence/${evidenceType}.txt`;
    writeFileSync(join(root, path), "测试夹具，只用于验证记录契约。\n");
    item.evidence.push({ id: evidenceType, checkId: evidenceType, workItemId: item.id, observedAt: "2026-10-16T00:00:00Z", type: evidenceType, candidate: item.candidate, result: "PASS", summary: "本地测试夹具", path,
      studioId: item.target.studioId, placeId: 0, universeId: 0, datamodel: ["play", "console"].includes(evidenceType) ? "Server" : "Edit" });
  }
  item.acceptanceResults = [{ id: "goal", status: "PASS", evidenceIds: [...item.requiredEvidence] }];
  item.domainReview = { status: "PASS", reviewer: "独立测试审查者", summary: "本地夹具审查记录", evidenceIds: [item.requiredEvidence[0]] };
  if (["SCENE", "DISPLAY_LAYER"].includes(type)) {
    item.visualContractRef = "evidence/visual-contract.json";
    writeFileSync(join(root, item.visualContractRef), JSON.stringify({ version: 1, workItemId: item.id,
      orientations: ["landscape"], inputs: ["keyboard-mouse"], locales: ["zh-CN"], safeAreaPolicy: "测试用安全区策略",
      viewports: [{ id: "desktop", width: 1280, height: 720, orientation: "landscape" }],
      coverage: { revision: 1, userMessageRef: "test-fixture-only", cases: [
        { id: "desktop-normal", viewportId: "desktop", input: "keyboard-mouse", locale: "zh-CN", scenario: "normal-play" },
      ] },
      nodes: [{ id: "root", path: "game.StarterGui.Test", parentId: null, role: "测试根节点", layoutRef: "屏幕安全内容区域" }],
    }));
    const play = item.evidence.find((entry) => entry.type === "play");
    play.datamodel = "Client";
    play.coverage = { revision: 1, caseId: "desktop-normal", viewportId: "desktop", width: 1280, height: 720,
      input: "keyboard-mouse", locale: "zh-CN", scenario: "normal-play" };
    item.visualReview = { status: "accepted", candidate: item.candidate, evidenceId: "visual", userMessageRef: "test-fixture-only",
      qualityResults: Object.fromEntries(["themeFit", "audienceFit", "gameplayReadability", "viewingComfort", "artCompletion"].map((key) => [key, { status: "PASS", reason: "仅本地测试夹具", userMessageRef: "test-fixture-only" }])),
      scenarios: ["normal-play", "repeated-feedback", "event-peak", "overlap-peak"].map((id) => ({ id, required: id === "normal-play", reason: "仅测试本地契约",
        technical: { result: id === "normal-play" ? "PASS" : "NOT_APPLICABLE", evidenceIds: id === "normal-play" ? ["play"] : [] },
        visual: { result: id === "normal-play" ? "PASS" : "NOT_APPLICABLE", evidenceIds: id === "normal-play" ? ["visual"] : [],
          userMessageRef: id === "normal-play" ? "test-fixture-only" : "", reason: "仅测试人工声明的结构" } })),
    };
    // 夹具走相同的单阶段完成/推进接口；固定时间仅模拟测试历史，不作为游戏执行证据。
    item.stageReviews = [createStageReview(item, "V0", "2026-10-16T00:00:00.000Z")];
    const stages = ["V0", "V1", "V2", "V3", "V4"];
    const stagePath = "evidence/stage-deliveries.md";
    for (const [index, stage] of stages.entries()) {
      writeFileSync(join(root, stagePath), `# ${stage}\n\n仅用于本地测试的 ${stage} 独立交付正文。\n\n`, { flag: index ? "a" : "w" });
      const keys = STAGE_DELIVERABLES[stage];
      const delivery = { path: stagePath, section: stage,
        deliverables: keys.map((id) => ({ id, summary: `测试交付 ${id}` })),
        exitChecks: keys.map((id) => ({ id, result: "PASS", basis: `测试依据 ${id}` })),
        presentedRef: `${stagePath}#${stage}`, remainingIssues: [], nextAction: "仅用于测试后续推进", reuse: [],
        evidenceIds: stage === "V3" ? ["readback"] : stage === "V4" ? ["readback", "console", "play", "visual"] : [], userMessageRef: "" };
      if (stage === "V2") delivery.decompositionRef = createDecompositionFixture(root, item, item.stageReviews.at(-1)).path;
      if (stage === "V3") delivery.production = { sampleAttempts: [createSampleFixture(root, item, item.stageReviews.at(-1))], expansions: [] };
      item = completeCurrentStage(item, root, delivery, { now: `2026-10-16T00:00:${String(index * 2 + 1).padStart(2, "0")}.000Z`, validateExit: () => true });
      if (stage !== "V4") item = advanceStage(item, root, { now: `2026-10-16T00:00:${String(index * 2 + 2).padStart(2, "0")}.000Z` });
    }
  }
  return item;
}
