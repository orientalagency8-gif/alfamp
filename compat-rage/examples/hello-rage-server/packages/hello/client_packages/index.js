// Client-side. Receives the welcome message + CEF browser demo.
mp.events.add('serverHello', payload => {
    mp.gui.chat.push(`Server said: ${payload.message}`);
});

// Browser demo: opens a small HUD when player presses F8 (toggle)
let browser = null;
mp.events.add('toggleHud', () => {
    if (browser) { browser.destroy(); browser = null; return; }
    browser = mp.browsers.new('package://hello/html/hud.html');
});
