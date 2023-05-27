# BreakoutJS

A simple breakout-like game that can be run in a browser, created using the Phaser framework.

Try it out at [https://breakoutjs.vercel.app](https://breakoutjs.vercel.app)!

# Running Locally

Use your favourite server to serve the root of this project.

Example:
```
npm install http-server -g
http-server -a localhost -p 8080 --cors
```

Then, in `js/main.js`, set `ASSETS_BASE_URL` to the address of your server, and view `index.html` in your preferred browser to play the game.
