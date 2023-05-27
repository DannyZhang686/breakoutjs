// Constant declarations
const ASSETS_BASE_URL = "https://breakoutjs.vercel.app/";
const CANVAS_WIDTH = 800, CANVAS_HEIGHT = 600;

// Game object coordinates
const ARROW_X = 400, ARROW_Y = 500;
const FLOOR_X = 400, FLOOR_Y = 515;

const SCORE_TEXT_X = 16, SCORE_TEXT_Y = 536;
const INFO_TEXT_X = 16, INFO_TEXT_Y = 568;

const BALL_VELOCITY = 150;
const SHOT_COOLDOWN_MS = 3000;

const ENEMY_SPAWN_LANES = 10;
const SPAWN_LINE_WIDTH_PX = 80;
const ENEMY_SPAWN_COOLDOWN_MS = 1000;
const ENEMY_SPAWN_CHANCE_PER_FRAME = 0.0005;

const ENEMY_SPAWN_Y = 15;
const MIN_TOPMOST_SPAWN_COORD = 40;

// Game entity variables
var floorGroup, ballGroup, enemyGroup, arrowGroup;
var scoreText, errorText;

// Game state object, initialized in startGame
var gameState;

const config = {
    type: Phaser.AUTO,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    physics: {
        default: 'arcade',
        arcade: {
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

function preload() {
    this.load.setBaseURL(ASSETS_BASE_URL);

    this.load.image('arrow', 'assets/arrow.png');
    this.load.image('ball', 'assets/ball.png');
    this.load.image('enemy', 'assets/enemy.png');
    this.load.image('floor', 'assets/floor.png');
}

function create() {
    // This function creates the groups of objects
    // Actual initialization occurs in startGame()

    // Physical objects: floorGroup, ballGroup, enemyGroup
    floorGroup = this.physics.add.staticGroup();
    ballGroup = this.physics.add.group();
    enemyGroup = this.physics.add.group();
    arrowGroup = this.physics.add.staticGroup();

    this.physics.add.overlap(floorGroup, ballGroup, ballHitsFloor, null, this);
    this.physics.add.overlap(floorGroup, enemyGroup, enemyHitsFloor, null, this);
    this.physics.add.collider(enemyGroup, enemyGroup);
    this.physics.add.collider(ballGroup, enemyGroup, null, ballHitsEnemy);

    startGame();

    scoreText = this.add.text(SCORE_TEXT_X, SCORE_TEXT_Y, 'Score: ' + gameState.score, { fontSize: '16px', fill: '#fff' });
    infoText = this.add.text(INFO_TEXT_X, INFO_TEXT_Y, '', { fontSize: '16px', fill: '#fff' });

    this.input.keyboard.on('keyup-R', function() {
        if (gameState.gameOver) {
            startGame();
        }
    })
}

function startGame() {
    // Initialize game state and game elements
    gameState = {
        score: 0,
        lastShotTime: 0,
        clickDragOngoing: false,
        gameOver: false,
        lastSpawnTime: Array(ENEMY_SPAWN_LANES).fill(0),
        topmostEnemyOnLane: Array(ENEMY_SPAWN_LANES).fill(CANVAS_HEIGHT)
    };

    floorGroup.create(FLOOR_X, FLOOR_Y, 'floor');

    arrowGroup.create(ARROW_X, ARROW_Y, 'arrow');
    arrowGroup.children.entries.forEach(theArrow => {
        theArrow.setInteractive();
        theArrow.on('pointerdown', function() {
            gameState.clickDragOngoing = true;
        });
    });
}

function update() {
    if (gameState.gameOver) return;

    // Update text
    scoreText.setText('Score: ' + gameState.score);

    var newInfoText = "Hold the mouse down on the arrow.";
    if (!canShoot()) {
        var cooldownTime = Math.floor((SHOT_COOLDOWN_MS - (Date.now() - gameState.lastShotTime)) / 1000) + 1;
        newInfoText = "Cooldown until next shot: " + cooldownTime + " second" + (cooldownTime == 1 ? "" : "s") + ".";
    } else if (gameState.clickDragOngoing) {
        newInfoText = "Drag to aim and release below the line to shoot!"
    }
    infoText.setText(newInfoText);

    // Handle click and drag events
    if (!game.input.activePointer.isDown) {
        if (gameState.clickDragOngoing && canShoot()) {
            clickDragReleased(game.input.activePointer.x, game.input.activePointer.y);
        }
        gameState.clickDragOngoing = false;
    }

    // Update arrow rotation
    if (gameState.clickDragOngoing) {
        var dx = game.input.activePointer.x - ARROW_X;
        var dy = ARROW_Y - game.input.activePointer.y;
        // Convert between angle coordinate systems
        // atan2 assumes 0 is positive x axis, and positive is counterclockwise
        // and phaser angle assumes 0 is positive y axis and positive is clockwise.
        arrowGroup.children.entries[0].angle = 90 - (Math.atan2(dy, dx) * 180 / Math.PI);

        // Also, we want the angle to point away from the mouse position, not toward it.
        arrowGroup.children.entries[0].angle += 180;
    }

    // Accelerate balls to BALL_VELOCITY (since some collisions are inelastic
    // and slow the balls down)
    ballGroup.children.entries.forEach(ball => {
        var ballSpeed = Math.sqrt(
            ball.body.velocity.x * ball.body.velocity.x + ball.body.velocity.y * ball.body.velocity.y
        );

        if (ballSpeed === 0) {
            // This should never happen if we are constantly updating speed to
            // approximate BALL_VELOCITY. Still, just to be safe, we handle this
            // case and force the ball to go straight up
            ball.setVelocity(0, -BALL_VELOCITY);
        } else {
            var scaleFactor = BALL_VELOCITY / ballSpeed;

            // Scale ball velocity so that ballSpeed (approximately) equals BALL_VELOCITY
            ball.setVelocity(
                scaleFactor * ball.body.velocity.x,
                scaleFactor * ball.body.velocity.y,
            );
        }
    });

    // Update topmostEnemyOnLane (for spawning purposes)
    gameState.topmostEnemyOnLane.fill(CANVAS_HEIGHT);
    
    enemyGroup.children.entries.forEach(enemy => {
        var laneNumber = Math.floor(enemy.x / SPAWN_LINE_WIDTH_PX);
        gameState.topmostEnemyOnLane[laneNumber] = Math.min(
            enemy.y,
            gameState.topmostEnemyOnLane[laneNumber]
        );
    });

    // Now, consider spawning enemies in each lane
    for (let i = 0; i < ENEMY_SPAWN_LANES; i++) {
        // It is possible for an enemy to spawn in lane i if:
        // - No other enemy has spawned recently, and
        // - There is no other enemy in the way
        if ((Date.now() - gameState.lastSpawnTime[i] >= ENEMY_SPAWN_COOLDOWN_MS) &&
            (gameState.topmostEnemyOnLane[i] > MIN_TOPMOST_SPAWN_COORD)) {
            if (Math.random() < ENEMY_SPAWN_CHANCE_PER_FRAME) {
                spawnEnemy((i + 0.5) * SPAWN_LINE_WIDTH_PX, ENEMY_SPAWN_Y);
                gameState.lastSpawnTime[i] = Date.now();
            }
        }
    }
}

function clickDragReleased(x, y) {
    // Drag was released at coordinates (x, y)
    if (y <= FLOOR_Y) return;
    
    var dx = x - ARROW_X;
    var dy = ARROW_Y - y;
    var aimAngle = Math.atan2(dy, dx);

    ballGroup.create(ARROW_X, ARROW_Y, 'ball');

    // Set properties of the new ball
    ballGroup.children.entries[ballGroup.children.entries.length - 1].setCollideWorldBounds(true);
    // Velocity should correpond to the aim angle of the arrow
    ballGroup.children.entries[ballGroup.children.entries.length - 1].setVelocity(
        -BALL_VELOCITY * Math.cos(aimAngle),
        BALL_VELOCITY * Math.sin(aimAngle)
    );
    ballGroup.children.entries[ballGroup.children.entries.length - 1].setBounce(1, 1);

    gameState.lastShotTime = Date.now();
}

function spawnEnemy(x, y) {
    enemyGroup.create(x, y, 'enemy');

    // Set properties of the new enemy
    enemyGroup.children.entries[enemyGroup.children.entries.length - 1].setCollideWorldBounds(true);

    // Enemies go faster when score is higher
    enemyGroup.children.entries[enemyGroup.children.entries.length - 1].setVelocity(
        0,
        Math.min(50, Math.max(10, gameState.score / 10))
    );
}

function ballHitsFloor(_floor, ball) {
    ball.destroy();
}

function ballHitsEnemy(_ball, enemy) {
    gameState.score += 10;
    enemy.destroy();
    return true;
}

function enemyHitsFloor(_enemy, _floor) {
    // Game over
    gameState.gameOver = true;

    var gameObjects = floorGroup.children.entries.concat(
        ballGroup.children.entries
    ).concat(
        enemyGroup.children.entries
    ).concat(
        arrowGroup.children.entries
    );
    
    gameObjects.forEach(gameObject => {
        gameObject.destroy();
    });

    scoreText.setText("Game over! Press [r] to restart.");
    infoText.setText("You scored " + gameState.score + " points.");
}

function canShoot() {
    return Date.now() - gameState.lastShotTime > SHOT_COOLDOWN_MS;
}
