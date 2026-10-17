import { checkStages } from "./stages.mjs";
import { checkVisualDelivery } from "./visual-review.mjs";

export { checkVisualDelivery, createVisualReview } from "./visual-review.mjs";

/** 可见工作项先核对真实阶段交付，再核对技术覆盖和人工显示判断。 */
export function checkVisible(item, usable, context) {
  if (!["SCENE", "DISPLAY_LAYER"].includes(item.type)) return;
  context.require(["deliverables", "manual"].includes(item.stagePolicy), "stagePolicy 必须为 deliverables 或 manual");
  checkStages(item, context, { requireComplete: true });
  checkVisualDelivery(item, usable, context);
}
