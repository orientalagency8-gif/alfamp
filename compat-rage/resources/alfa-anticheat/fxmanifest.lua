fx_version 'cerulean'
game 'gta5'

author 'Alfa MP'
description 'Baseline anti-cheat: server-side movement validation, spawn-rate limits, HWID banlist'
version '0.1.0'

server_scripts {
    'server/anticheat.js',
}

client_scripts {
    'client/anticheat-client.js',
}
