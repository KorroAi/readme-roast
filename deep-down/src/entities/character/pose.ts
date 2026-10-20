import { clamp, damp, lerp, saturate, smoothstep } from '../../core/math';

export interface ExplorerAnimState {
  /** Horizontal speed in m/s. */
  speed: number;
  grounded: boolean;
  verticalVelocity: number;
  /** Radians, + = looking up. */
  aimPitch: number;
  time: number;
}

/**
 * Joint angles (radians) and body offsets for one frame.
 * Pitch is a rotation about X: + tilts the torso forward, the head down, and swings a hanging
 * limb backward. Roll is about Z (+ moves a hanging limb toward +X, the explorer's left).
 */
export interface ExplorerPose {
  bodyY: number;
  squashY: number;
  squashXZ: number;
  hipsYaw: number;
  hipsRoll: number;
  torsoPitch: number;
  torsoYaw: number;
  torsoRoll: number;
  torsoLift: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  packPitch: number;
  thighL: number;
  kneeL: number;
  thighR: number;
  kneeR: number;
  shoulderL: number;
  rollL: number;
  elbowL: number;
  shoulderR: number;
  rollR: number;
  elbowR: number;
  wristR: number;
}

export function createPose(): ExplorerPose {
  return {
    bodyY: 0,
    squashY: 1,
    squashXZ: 1,
    hipsYaw: 0,
    hipsRoll: 0,
    torsoPitch: 0,
    torsoYaw: 0,
    torsoRoll: 0,
    torsoLift: 0,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    packPitch: 0,
    thighL: 0,
    kneeL: 0,
    thighR: 0,
    kneeR: 0,
    shoulderL: 0,
    rollL: 0,
    elbowL: 0,
    shoulderR: 0,
    rollR: 0,
    elbowR: 0,
    wristR: 0,
  };
}

/** Walk speed at which the cycle reaches full stride (the player's walk speed). */
const STRIDE_SPEED = 4.6;
/**
 * Steps per second at STRIDE_SPEED. With ~0.95 m steps a true no-slip cadence would be ~4.8;
 * 3.4 keeps the chunky explorer readable (not frantic) with only slight foot slide.
 */
const CADENCE = 3.4;

/**
 * Mining swing channels: right shoulder pitch, right arm roll, right elbow, right wrist (pickaxe
 * pitch relative to the forearm), then torso pitch and yaw added on top of the body pose.
 */
const CH = 6;
const WINDUP_END = 0.4;
/** The pick lands at 55% of the swing. */
export const SWING_IMPACT = 0.55;
const FOLLOW_END = 0.68;

/**
 * Procedural animation for the explorer: idle breathing and sway, a speed-scaled walk cycle with
 * body bob, jump/fall poses, a landing squash spring, aim-following head and chest, and a
 * three-phase mining swing on the right arm. Every input is smoothed, and a swing starts from the
 * arm's current pose, so state changes never pop.
 */
export class ExplorerAnimator {
  readonly pose: ExplorerPose = createPose();
  private phase = 0;
  private walk = 0;
  private air = 0;
  private rise = 0.5;
  private airTime = 0;
  private lastAirVV = 0;
  private grounded = true;
  private squash = 0;
  private squashVel = 0;
  private aim = 0;
  private swingT = 0;
  private swingDur = 0;
  private readonly swingFrom = new Float64Array(CH);
  private readonly last = new Float64Array(CH);
  private readonly base = new Float64Array(CH);
  private readonly windup = new Float64Array(CH);
  private readonly impact = new Float64Array(CH);
  private readonly follow = new Float64Array(CH);
  private readonly ch = new Float64Array(CH);

  constructor() {
    this.update(0, { speed: 0, grounded: true, verticalVelocity: 0, aimPitch: 0, time: 0 });
  }

  get swinging(): boolean {
    return this.swingT < this.swingDur;
  }

  /** Swing progress in [0, 1], or 1 when idle. */
  get swingProgress(): number {
    return this.swinging ? this.swingT / this.swingDur : 1;
  }

  startSwing(duration: number, startAt = 0): void {
    // Start from wherever the arm is now so back-to-back swings blend without a pop.
    this.swingFrom.set(this.last);
    this.swingDur = Math.max(0.1, duration);
    // The descent's strike snap (SPEC §6.9): start at the impact pose (startAt 0.55), no wind-up.
    this.swingT = Math.min(0.99, Math.max(0, startAt)) * this.swingDur;
  }

  update(dtIn: number, s: ExplorerAnimState): ExplorerPose {
    const P = this.pose;
    const dt = clamp(dtIn, 0, 0.1);
    const t = s.time;
    const speed = Math.max(0, s.speed);

    // Ground/air bookkeeping; a landing kicks the squash spring by the fall speed.
    if (!s.grounded) {
      this.airTime += dt;
      this.lastAirVV = s.verticalVelocity;
    } else {
      if (!this.grounded && this.airTime > 0.12) this.squashVel += 3 + 14 * saturate((-this.lastAirVV - 1.5) / 14);
      this.airTime = 0;
    }
    this.grounded = s.grounded;
    this.stepSquash(dt);

    this.walk = damp(this.walk, s.grounded && speed > 0.1 ? saturate(speed / STRIDE_SPEED) : 0, 9, dt);
    if (speed > 0.05) {
      const stepsPerSecond = CADENCE * Math.sqrt(clamp(speed / STRIDE_SPEED, 0.2, 1.8));
      this.phase = (this.phase + dt * stepsPerSecond * Math.PI) % (Math.PI * 2);
    }
    const airTarget = !s.grounded && this.airTime > 0.07 ? 1 : 0;
    this.air = damp(this.air, airTarget, airTarget ? 10 : 18, dt);
    this.rise = damp(this.rise, smoothstep(-3, 3, s.verticalVelocity), 8, dt);
    this.aim = damp(this.aim, clamp(s.aimPitch, -1.2, 1.2), 12, dt);

    const air = this.air;
    const rise = this.rise;
    const walk = this.walk * (1 - air);
    const idle = (1 - this.walk) * (1 - air);
    const sq = clamp(this.squash, 0, 0.6);
    const sL = Math.sin(this.phase);
    const cL = Math.cos(this.phase);
    const breath = Math.sin(t * 1.7);
    const sway = Math.sin(t * 0.55);

    // Legs: thigh swing, knee bend while the leg swings forward, then air tuck and landing crouch.
    let thighL = -0.68 * walk * sL + 0.025 * idle * sway;
    let thighR = 0.68 * walk * sL - 0.025 * idle * sway;
    let kneeL = walk * (0.08 + 0.95 * Math.max(0, cL));
    let kneeR = walk * (0.08 + 0.95 * Math.max(0, -cL));
    thighL = lerp(thighL, lerp(-0.3, -0.8, rise), air);
    kneeL = lerp(kneeL, lerp(0.35, 1.15, rise), air);
    thighR = lerp(thighR, lerp(-0.05, 0.2, rise), air);
    kneeR = lerp(kneeR, lerp(0.55, 0.6, rise), air);
    P.thighL = thighL - 0.6 * sq;
    P.thighR = thighR - 0.6 * sq;
    P.kneeL = kneeL + 1.2 * sq;
    P.kneeR = kneeR + 1.2 * sq;

    // Body: bob twice per stride (lowest with the legs spread), crouch on landing.
    P.bodyY = -0.045 * walk * (0.5 - 0.5 * Math.cos(2 * this.phase)) - 0.14 * sq;
    P.squashY = 1 - 0.07 * sq;
    P.squashXZ = 1 + 0.035 * sq;
    P.hipsYaw = -0.12 * walk * sL;
    P.hipsRoll = 0.012 * idle * sway;

    // Arms. Left: the lantern stays forward and low so its light falls on the path.
    let shL = -0.42 + 0.12 * walk * sL - 0.02 * idle * breath;
    let rollL = 0.1;
    let elL = -0.6 - 0.08 * walk * Math.max(0, -sL);
    // Right: the pickaxe is carried at the ready and swings opposite the left leg.
    let shR = -0.25 - 0.3 * walk * sL - 0.02 * idle * breath;
    let rollR = -0.14;
    let elR = -0.75 - 0.15 * walk * Math.max(0, sL);
    const wrR = 1.75;
    // Airborne: arms lift and spread for balance; on landing they push out.
    shL = lerp(shL, lerp(-0.5, -0.7, rise), air) - 0.15 * sq;
    rollL = lerp(rollL, lerp(0.55, 0.3, rise), air) + 0.25 * sq;
    elL = lerp(elL, -0.7, air);
    shR = lerp(shR, lerp(-0.45, -0.6, rise), air) - 0.15 * sq;
    rollR = lerp(rollR, lerp(-0.55, -0.3, rise), air) - 0.25 * sq;
    elR = lerp(elR, -0.9, air);
    P.shoulderL = shL;
    P.rollL = rollL;
    P.elbowL = elL;

    // Mining swing overrides the right arm and adds a torso twist.
    const b = this.base;
    b[0] = shR;
    b[1] = rollR;
    b[2] = elR;
    b[3] = wrR;
    b[4] = 0;
    b[5] = 0;
    const ch = this.ch;
    if (this.swinging) {
      this.swingT = Math.min(this.swingDur, this.swingT + dt);
      this.evalSwing(this.swingT / this.swingDur);
    } else {
      ch.set(b);
    }
    this.last.set(ch);
    P.shoulderR = ch[0];
    P.rollR = ch[1];
    P.elbowR = ch[2];
    P.wristR = ch[3];

    // Torso: forward lean with speed, breathing, air and landing, leaning back to look up.
    P.torsoPitch = 0.07 * walk + 0.012 * idle * breath + lerp(-0.05, 0.08, rise) * air + 0.22 * sq - 0.18 * this.aim + ch[4];
    P.torsoYaw = 0.2 * walk * sL + ch[5];
    P.torsoRoll = -0.008 * idle * sway;
    P.torsoLift = 0.005 * idle * breath;
    // Head: keeps the gaze level against the torso, follows the aim, glances around when idle.
    P.headPitch = -0.7 * (P.torsoPitch - ch[4]) - 0.45 * this.aim + 0.012 * idle * Math.sin(t * 1.7 - 0.6) - 0.1 * sq;
    P.headYaw = -0.5 * P.torsoYaw + 0.07 * idle * Math.sin(t * 0.31);
    P.headRoll = 0.02 * idle * Math.sin(t * 0.47);
    P.packPitch = 0.03 * walk * Math.sin(2 * this.phase - 0.6) - 0.08 * sq + 0.06 * air * (1 - rise);
    return P;
  }

  /** Critically damped spring for the landing crouch, sub-stepped so long frames stay stable. */
  private stepSquash(dt: number): void {
    const w = 12;
    const steps = Math.ceil(dt / (1 / 120));
    const h = steps > 0 ? dt / steps : 0;
    for (let i = 0; i < steps; i++) {
      this.squashVel += (-w * w * this.squash - 2 * w * this.squashVel) * h;
      this.squash += this.squashVel * h;
    }
  }

  /**
   * Keyframed swing: ease into the wind-up over the head, accelerate into the strike (impact at
   * SWING_IMPACT), ease into the follow-through, then blend back to the live base pose.
   */
  private evalSwing(p: number): void {
    const a = this.aim;
    setChannels(this.windup, -2.95 - 0.15 * a, -0.18, -1.2, 3.1, -0.12, -0.28);
    setChannels(this.impact, -1.45 - 0.8 * a, -0.1, -0.12, 2.85, 0.16, 0.12);
    setChannels(this.follow, -1.25 - 0.7 * a, -0.1, -0.2, 2.95, 0.2, 0.16);
    const ch = this.ch;
    let from: Float64Array;
    let to: Float64Array;
    let u: number;
    if (p < WINDUP_END) {
      from = this.swingFrom;
      to = this.windup;
      u = smoothstep(0, 1, p / WINDUP_END);
    } else if (p < SWING_IMPACT) {
      from = this.windup;
      to = this.impact;
      const k = (p - WINDUP_END) / (SWING_IMPACT - WINDUP_END);
      u = k * k;
    } else if (p < FOLLOW_END) {
      from = this.impact;
      to = this.follow;
      const k = 1 - (p - SWING_IMPACT) / (FOLLOW_END - SWING_IMPACT);
      u = 1 - k * k;
    } else {
      from = this.follow;
      to = this.base;
      u = smoothstep(FOLLOW_END, 1, p);
    }
    for (let i = 0; i < CH; i++) ch[i] = from[i] + (to[i] - from[i]) * u;
  }
}

function setChannels(out: Float64Array, a: number, b: number, c: number, d: number, e: number, f: number): void {
  out[0] = a;
  out[1] = b;
  out[2] = c;
  out[3] = d;
  out[4] = e;
  out[5] = f;
}
