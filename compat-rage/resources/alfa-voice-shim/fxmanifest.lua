fx_version 'cerulean'
game 'gta5'

author 'Alfa MP'
description 'Voice-chat compatibility: maps RAGE MP proximity-voice API to CFX Mumble backend'
version '0.1.0'

server_scripts {
    'server/voice-server.js',
}

client_scripts {
    'client/voice-client.js',
}
