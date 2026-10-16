-- 只返回布局数值，不采图、不执行界面逻辑，也不据此判断视觉显示通过。
local runService = game:FindService("RunService")
local root = game:FindService("StarterGui")
local context = "Edit"
if runService and runService:IsRunning() then
	context = runService:IsClient() and "Client" or "Server"
	local players = game:FindService("Players")
	local player = players and players.LocalPlayer
	root = player and player:FindFirstChildOfClass("PlayerGui") or nil
end
if not root then
	return { version = 1, available = false, context = context, reason = "当前上下文没有可采集的界面根节点" }
end

-- 不同 Studio 构建或对象类型可能没有某个属性，逐项记录可读值而不猜默认值。
local function readProperty(instance, property)
	local ok, value = pcall(function()
		return instance[property]
	end)
	return ok and tostring(value) or "UNAVAILABLE"
end

local queue = { root }
local rows = {}
local cursor = 1
local limit = 128
local truncated = false
while cursor <= #queue do
	local instance = queue[cursor]
	cursor += 1
	if instance:IsA("GuiObject") or instance:IsA("ScreenGui") then
		local row = { path = instance:GetFullName(), className = instance.ClassName }
		if instance:IsA("GuiObject") then
			row.position = readProperty(instance, "AbsolutePosition")
			row.size = readProperty(instance, "AbsoluteSize")
			row.anchorPoint = readProperty(instance, "AnchorPoint")
			row.visible = readProperty(instance, "Visible")
			row.clipsDescendants = readProperty(instance, "ClipsDescendants")
		end
		if instance:IsA("ScreenGui") then
			row.screenInsets = readProperty(instance, "ScreenInsets")
			row.clipToDeviceSafeArea = readProperty(instance, "ClipToDeviceSafeArea")
		end
		if instance:IsA("ImageLabel") or instance:IsA("ImageButton") then
			row.scaleType = readProperty(instance, "ScaleType")
			row.sliceCenter = readProperty(instance, "SliceCenter")
			row.sliceScale = readProperty(instance, "SliceScale")
		end
		table.insert(rows, row)
	end
	local children = instance:GetChildren()
	local remaining = limit - #queue
	if #children > remaining then truncated = true end
	for index = 1, math.min(#children, remaining) do
		table.insert(queue, children[index])
	end
end

return { version = 1, available = true, context = context, root = root:GetFullName(), scanned = #queue, truncated = truncated, nodes = rows }
