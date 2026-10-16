-- 只采集身份和有限层级，不读脚本源码、不创建实例、不切换运行模式。
local serviceNames = {
	"Workspace", "ServerScriptService", "ServerStorage", "ReplicatedStorage",
	"StarterPlayer", "StarterGui", "Players",
}

-- 限制每个容器的预览规模，避免把项目调查变成全量层级转储。
local function summarizeService(name)
	local service = game:FindService(name)
	if not service then
		return { name = name, available = false }
	end
	local children = service:GetChildren()
	local preview = {}
	for index = 1, math.min(#children, 16) do
		local child = children[index]
		table.insert(preview, { name = child.Name, className = child.ClassName })
	end
	return { name = name, available = true, childCount = #children, truncated = #children > 16, preview = preview }
end

local services = {}
for _, name in serviceNames do
	table.insert(services, summarizeService(name))
end

return {
	version = 1,
	placeName = game.Name,
	placeId = game.PlaceId,
	universeId = game.GameId,
	services = services,
}
