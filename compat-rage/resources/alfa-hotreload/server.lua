-- alfa-hotreload — auto-restart resources on file change.
-- Active only when sv_devMode true. Polls mtime every 1.5s, debounces restarts.

local enabled = GetConvarBool('sv_devMode', false)
if not enabled then
    print('[alfa-hotreload] dev mode off — exiting (set sv_devMode true to enable)')
    return
end

local DEBOUNCE_MS = 500
local POLL_MS = 1500
local WATCH_EXTS = { lua = true, js = true, ts = true, cs = true, dll = true, ['fxmanifest.lua'] = true }

local fileTimes = {}    -- [resource][path] = mtime
local pendingRestart = {}

local function shouldWatch(filename)
    for ext in pairs(WATCH_EXTS) do
        if filename:sub(-#ext) == ext then return true end
    end
    return false
end

local function snapshot(resource)
    local path = GetResourcePath(resource)
    local result = {}
    local function walk(dir)
        for _, name in ipairs(getFiles(dir) or {}) do
            local full = dir .. '/' .. name
            if isDir(full) then walk(full)
            elseif shouldWatch(name) then
                local mtime = getMTime(full)
                if mtime then result[full] = mtime end
            end
        end
    end
    walk(path)
    return result
end

-- Minimal shims because GetResourceMetadata / file walking aren't exposed natively;
-- we use io.popen on POSIX. (FXServer on Linux supports this.)
function getFiles(dir)
    local p = io.popen('ls -1 "' .. dir .. '" 2>/dev/null'); if not p then return {} end
    local r = {}; for line in p:lines() do table.insert(r, line) end; p:close(); return r
end
function isDir(path)
    local p = io.popen('test -d "' .. path .. '" && echo 1 || echo 0'); if not p then return false end
    local r = p:read('*a'); p:close(); return r:sub(1,1) == '1'
end
function getMTime(path)
    local p = io.popen('stat -c %Y "' .. path .. '" 2>/dev/null'); if not p then return nil end
    local r = tonumber(p:read('*a')); p:close(); return r
end

local function scanAll()
    local n = GetNumResources()
    for i = 0, n - 1 do
        local res = GetResourceByFindIndex(i)
        if res and GetResourceState(res) == 'started' and res ~= GetCurrentResourceName() then
            local newSnap = snapshot(res)
            local oldSnap = fileTimes[res] or {}
            local changed = false
            for path, mtime in pairs(newSnap) do
                if oldSnap[path] ~= mtime then changed = true; break end
            end
            if changed and oldSnap and next(oldSnap) then
                pendingRestart[res] = GetGameTimer() + DEBOUNCE_MS
            end
            fileTimes[res] = newSnap
        end
    end
end

local function processRestarts()
    local now = GetGameTimer()
    for res, dueAt in pairs(pendingRestart) do
        if now >= dueAt then
            print(('[alfa-hotreload] restarting %s'):format(res))
            ExecuteCommand('restart ' .. res)
            pendingRestart[res] = nil
        end
    end
end

CreateThread(function()
    print('[alfa-hotreload] watching resources every ' .. POLL_MS .. 'ms (devMode on)')
    -- Prime baseline (don't restart on first scan)
    scanAll()
    pendingRestart = {}
    while true do
        Wait(POLL_MS)
        scanAll()
        processRestarts()
    end
end)
