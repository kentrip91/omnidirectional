const ioHook = require('iohook');

module.exports = function dirSkillsClassic(mod) {
	const keys = {
		17: false, // w
		16: false, // q
		31: false, // s
		18: false, // e
	};

	ioHook.on('keydown', (event) => {
		if (!mod.settings.enabled) return;
		if (event.keycode in keys) keys[event.keycode] = true;
	});

	ioHook.on('keyup', (event) => {
		if (!mod.settings.enabled) return;
		if (event.keycode in keys) keys[event.keycode] = false;
	});

	ioHook.start();
	let w = 0,
		classSkills = null;

	const simpleAngPackets = [
		'C_START_SKILL',
		'C_START_TARGETED_SKILL',
		'C_START_COMBO_INSTANT_SKILL',
		'C_START_INSTANCE_SKILL',
		'C_PRESS_SKILL',
		'C_NOTIFY_LOCATION_IN_ACTION',
		'C_PLAYER_LOCATION',
		'S_SPAWN_ME',
	];
	const gameIdAngPackets = ['S_ACTION_STAGE', 'S_ACTION_END'];

	for (const packet of simpleAngPackets) {
		mod.hook(packet, '*', { order: -9999999, filter: { fake: null } }, (event) => {
			w = event.w || w;
		});
	}

	for (const packet of gameIdAngPackets) {
		mod.hook(packet, '*', { order: -9999999, filter: { fake: null } }, (event) => {
			if (!mod.game.me.is(event.gameId)) return;
			w = event.w || w;
		});
	}

	mod.hook('S_SPAWN_ME', 'event', () => {
		classSkills = mod.settings.skills[mod.game.me.class]
	});

	mod.hook('S_RETURN_TO_LOBBY', 'event', () => {
		classSkills = null;
	});

	mod.hook('C_START_SKILL', 7, { order: -999999 }, (event) => {
		if (!mod.settings.enabled) return;
		if (!(keys[17] || keys[16] || keys[31] || keys[18])) return;
		if (!classSkills) return;

		const skillBase = Math.floor(event.skill.id / 1e4);
		const skillSub = event.skill.id % 100;
		const skill = classSkills[`${skillBase}:${skillSub}`] || classSkills[skillBase];
		if (!skill || !skill.enabled || skill.isTargetedSkill) return;

		if (skill.baseDirection === 'north') {
			if (skill.strictDest && mod.settings.enableStrictDest) {
				const w = adjustAngle(event.w, false);
				const dest = generateNewDest(w, skill.strictDestLength, event.loc);

				event.w = w;
				event.dest = dest;

				return true;
			}
			if (!skill.strictDest) {
				event.w = adjustAngle(event.w, false);
				return true;
			}
		}

		if (skill.baseDirection === 'south') {
			if (skill.strictDest && mod.settings.enableStrictDest) {
				const w = adjustAngle(event.w, true);
				const dest = generateNewDest(w, skill.strictDestLength, event.loc);

				event.w = w;
				event.dest = dest;

				return true;
			}
			if (!skill.strictDest) {
				event.w = adjustAngle(event.w, true);
				return true;
			}
		}
	});

	mod.hook('C_START_TARGETED_SKILL', 6, { order: -999999 }, (event) => {
		if (!mod.settings.enabled) return;
		if (!mod.settings.enableTargeted) return;
		if (!(keys[17] || keys[16] || keys[31] || keys[18])) return;
		if (!classSkills) return;

		const skillBase = Math.floor(event.skill.id / 1e4);
		const skillSub = event.skill.id % 100;
		const skill = classSkills[`${skillBase}:${skillSub}`] || classSkills[skillBase];
		if (!skill || !skill.enabled || !skill.isTargetedSkill) return;

		// Handle normal directional skills (e.g., charging lunge)
		if (skill.strictDest && skill.baseDirection === 'north') {
			const w = adjustAngle(event.w, false);
			const dest = generateNewDest(w, skill.strictDestLength, event.loc);

			event.w = w;
			event.dest = dest;
			return true;
		}
	});

	mod.command.add('omni', (...args) => {
		switch (args[0]) {
			case 'toggle':
				mod.settings.enabled = !mod.settings.enabled;
				mod.command.message(`Mod is completely ${mod.settings.enabled ? 'en' : 'dis'}abled.`);
				return;

			case 'targeted':
				mod.settings.enableTargeted = !mod.settings.enableTargeted;
				mod.command.message(
					`Targeted skills (e.g., Charging Lunge/Slash) are ${mod.settings.enableTargeted ? 'en' : 'dis'}abled.`
				);
				return;

			case 'strict':
				mod.settings.enableStrictDest = !mod.settings.enableStrictDest;
				mod.command.message(
					`Strict dest skills (e.g., Teleport Jaunt) are ${mod.settings.enableStrictDest ? 'en' : 'dis'}abled.`
				);
				return;

			case 'skill':
				if (!args[1]) {
					mod.command.message('Need to provide a skill base ([X]yyzz or [XX]yyzz).');
					return;
				}

				const arg = Number(args[1]);
				if (isNaN(arg)) {
					mod.command.message('Skill base must be a number.');
					return;
				}

				if (!classSkills) return;
				const skill = classSkills[arg];

				if (!skill) {
					mod.command.message("That skill base isn't set up.");
					return;
				}

				skill.enabled = !skill.enabled;
				mod.command.message(`Skill ${arg} for your class is now ${skill.enabled ? 'en' : 'dis'}abled.`);
				return;

			default:
				mod.command.message('commands:\n- !omni toggle\n- !omni targeted\n- !omni strict\n- !omni skill <base>');
		}
	});

	function generateNewDest(w, dist, loc) {
		const dx = Math.cos(w) * dist;
		const dy = Math.sin(w) * dist;

		return {
			x: loc.x + dx,
			y: loc.y + dy,
			z: loc.z,
		};
	}

	function adjustAngle(w, needsFlip) {
		if (needsFlip) {
			w = (w + Math.PI) % (2 * Math.PI);
			if (w > Math.PI) w -= 2 * Math.PI;
		}

		const W = keys[17],
			Q = keys[16],
			S = keys[31],
			E = keys[18];
		const diagonalOffset = Math.PI / 4;
		const cardinalOffset = Math.PI / 2;

		if (W && Q) return normalizeAngle(w - diagonalOffset); // NW
		if (W && E) return normalizeAngle(w + diagonalOffset); // NE
		if (S && Q) return normalizeAngle(w - 3 * diagonalOffset); // SW
		if (S && E) return normalizeAngle(w + 3 * diagonalOffset); // SE

		if (W) return normalizeAngle(w); // N
		if (S) return normalizeAngle(w + Math.PI); // S
		if (Q) return normalizeAngle(w - cardinalOffset); // W
		if (E) return normalizeAngle(w + cardinalOffset); // E

		return w;
	}

	// normalize angle to -pi ~ pi
	function normalizeAngle(angle) {
		angle = angle % (2 * Math.PI);
		if (angle > Math.PI) angle -= 2 * Math.PI;
		if (angle < -Math.PI) angle += 2 * Math.PI;
		return angle;
	}

	this.destructor = () => {
		ioHook.stop();
		for (const key in keys) {
			keys[key] = false;
		}
		classSkills = null;
	};
};
