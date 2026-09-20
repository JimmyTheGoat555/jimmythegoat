// What each built-in exercise is and how to do it well — the `description`
// and `tips` half of the exercise schema (see exercises.js, which folds
// these into EXERCISES by id).
//
// Kept in its own file so exercises.js stays the compact table of ids,
// loads and flags that half the app imports, and this prose can be edited
// without wading through it. A custom exercise carries the same two
// fields on its own object when it has them (useExercises).
//
// The description is two or three plain sentences: what the movement is,
// what it trains, and the one thing about the setup that matters. The
// tips are the cues a good spotter would shout — short, imperative, and
// no more than three, because the workout screen shows them one at a
// time in a speech bubble and nobody reads a fourth.
export const EXERCISE_GUIDES = {
  // Chest
  'bench-press': {
    description:
      'The barbell press from a flat bench: the standard chest builder, loading the pecs, front delts and triceps together. Lie with your eyes under the bar, feet planted, and press from the lower chest to lockout.',
    tips: [
      'Pinch the shoulder blades back and down before you unrack.',
      'Elbows about 45° from the torso, not flared out to 90°.',
      'Touch the lower chest, then drive your feet into the floor as you press.',
    ],
  },
  'incline-db-press': {
    description:
      'Pressing dumbbells on a 30–45° incline shifts the work to the upper chest and front delts, with each arm on its own. Independent hands allow a deeper stretch at the bottom than a bar does.',
    tips: [
      'Set the bench at 30–45°; steeper turns it into a shoulder press.',
      'Lower until the dumbbells are level with the chest, elbows under the wrists.',
      'Press up and slightly in, without clanking the dumbbells together.',
    ],
  },
  'decline-bench-press': {
    description:
      'A barbell press on a downward-sloping bench, which shortens the range and puts the emphasis on the lower chest. Most lifters press a little more here than on the flat bench.',
    tips: [
      'Hook your feet under the pads before you unrack.',
      'Lower the bar to the lower chest, wrists stacked over the elbows.',
      'Keep the reps controlled; the short range makes it easy to bounce.',
    ],
  },
  'chest-press-machine': {
    description:
      'A seated press along a fixed path, so the chest works without balancing a bar. A good place to push close to failure safely, or to finish after the free-weight pressing.',
    tips: [
      'Set the seat so the handles sit at mid-chest height.',
      'Keep the shoulder blades pinned to the pad through the whole press.',
      'Stop just short of lockout to keep the tension on the chest.',
    ],
  },
  'chest-fly': {
    description:
      'Lying on a bench, the dumbbells travel out and back in a wide arc with the elbows fixed, isolating the pecs through a long stretch. Light weight and control do the work here.',
    tips: [
      'Keep a soft bend in the elbows and hold it for the whole rep.',
      'Lower only until you feel the stretch across the chest, no deeper.',
      'Squeeze the pecs to bring the dumbbells together, like hugging a barrel.',
    ],
  },
  'pec-deck': {
    description:
      'The chest fly on a machine: a fixed arc with the arms on pads, so the pecs get a hard squeeze with nothing to balance. Ideal for a slow, controlled finisher.',
    tips: [
      'Adjust the seat so the pads sit level with the middle of the chest.',
      'Pause and squeeze for a second at the front.',
      'Let the pads back slowly; the stretch is half the exercise.',
    ],
  },
  'push-up': {
    description:
      'The bodyweight press: hands under the shoulders, body in one line, chest to the floor and back up. Trains the chest, shoulders and triceps, and the core that keeps the plank rigid.',
    tips: [
      'Hands just outside shoulder width, fingers pointing forward.',
      'Squeeze the glutes and abs so the hips never sag.',
      'Chest to within a fist of the floor on every rep.',
    ],
  },
  dips: {
    description:
      'Suspended between parallel bars, the body lowers and presses back up. A forward lean loads the lower chest; upright loads the triceps. Add weight from a belt once bodyweight is easy.',
    tips: [
      'Lean forward and let the elbows flare slightly to hit the chest.',
      'Lower until the upper arm is about parallel to the floor.',
      'Keep the shoulders down, away from the ears, at the bottom.',
    ],
  },
  'cable-crossover': {
    description:
      'Standing between two high pulleys, the handles are swept down and together in front of the body. Constant cable tension keeps the pecs loaded at the point where a dumbbell fly goes slack.',
    tips: [
      'Stagger your stance and lean slightly forward from the hips.',
      'Bring the hands together and cross them a little at the finish.',
      'Control the return; don’t let the stack pull your shoulders forward.',
    ],
  },

  // Back
  deadlift: {
    description:
      'Lifting a barbell from the floor to a standing lockout with the whole back side of the body: hamstrings, glutes, spinal erectors, lats and grip. The heaviest lift in the gym, and the most technique-sensitive.',
    tips: [
      'Bar over the middle of the foot, shins touching it before you pull.',
      'Brace hard and keep the spine neutral; the chest and hips rise together.',
      'Push the floor away rather than pulling the bar up.',
    ],
  },
  'barbell-row': {
    description:
      'Bent over at the hips with a barbell hanging at arm’s length, the bar is rowed to the lower ribs. Builds the lats, rhomboids and rear delts, and teaches the hinge the deadlift depends on.',
    tips: [
      'Hinge until the torso is around 45° or lower, back flat.',
      'Pull with the elbows, driving them back past the torso.',
      'Lower under control; a dropped bar means a rounded back on the next rep.',
    ],
  },
  't-bar-row': {
    description:
      'A row on a bar anchored at one end, with the load hanging close to the body and a neutral grip. Easier on the lower back than a free barbell row, with a heavy squeeze through the mid-back.',
    tips: [
      'Chest up and knees soft; the hinge is at the hips.',
      'Drive the elbows back and squeeze the shoulder blades together at the top.',
      'Don’t stack plates that stop the bar short; full range matters more.',
    ],
  },
  'db-row': {
    description:
      'One hand and one knee on a bench, the other hand rows a dumbbell from a full hang to the hip. Each side works alone, so a weaker side can’t hide behind the stronger one.',
    tips: [
      'Let the dumbbell hang long at the bottom for a full lat stretch.',
      'Row toward the hip, not the shoulder, with the elbow close.',
      'Keep the torso still; the twist that helps the rep isn’t the back working.',
    ],
  },
  'pull-up': {
    description:
      'Hanging from a bar with an overhand grip, the body is pulled until the chin clears it. The cleanest test of relative back strength there is: lats, biceps, grip and a lot of core.',
    tips: [
      'Start from a dead hang with the shoulders pulled down first.',
      'Drive the elbows to the ribs, not the chin to the bar.',
      'Lower all the way; half reps are half the exercise.',
    ],
  },
  'chin-up': {
    description:
      'The pull-up with an underhand grip, hands about shoulder width. The biceps do more of the work, which is why most people manage a rep or two more than with the overhand grip.',
    tips: [
      'Grip just inside shoulder width with the palms facing you.',
      'Keep the chest up and pull the bar to the collarbones.',
      'Control the descent; the negative builds as much as the pull.',
    ],
  },
  'lat-pulldown': {
    description:
      'Seated under a high cable, a wide bar is pulled to the upper chest. The pull-up’s movement with an adjustable load, so it’s where most people build the strength for their first pull-up.',
    tips: [
      'Lock the thighs under the pads before you pull.',
      'Lean back a little and bring the bar to the upper chest.',
      'Let the arms straighten fully at the top for a stretch in the lats.',
    ],
  },
  'seated-cable-row': {
    description:
      'Seated with the feet braced, a handle is pulled from a low cable to the stomach. Works the whole mid-back through a horizontal pull, with a steady load on every inch of the rep.',
    tips: [
      'Sit tall, chest up, and keep the torso nearly still.',
      'Pull the handle to the navel and squeeze the shoulder blades together.',
      'Let the shoulders round forward slightly at the stretch, then pull.',
    ],
  },
  'straight-arm-pulldown': {
    description:
      'Standing at a high cable, the bar is pushed down in a wide arc with the arms held straight. Isolates the lats with no biceps involved, and teaches the feeling of pulling with the back.',
    tips: [
      'A slight bend in the elbows, held fixed for the whole rep.',
      'Sweep the bar down to the thighs and pause there.',
      'Keep it light; this is a feel exercise, not a strength one.',
    ],
  },

  // Legs
  squat: {
    description:
      'The barbell on the upper back, sitting down until the hips pass the knees and standing back up. The foundation for the quads, glutes and the trunk that holds the load; the lift everything else is measured against.',
    tips: [
      'Brace the trunk before every rep and keep it braced.',
      'Knees track over the toes; push them out, never in.',
      'Hit at least parallel; depth beats load.',
    ],
  },
  'bulgarian-split-squat': {
    description:
      'A single-leg squat with the rear foot raised on a bench behind you, dumbbells in hand. Brutal on the quads and glutes of the front leg, and it exposes any strength difference between sides.',
    tips: [
      'Front foot far enough forward that the shin stays near vertical.',
      'Drop the back knee straight down; don’t lean over the front foot.',
      'Drive through the whole front foot, heel included.',
    ],
  },
  'leg-press': {
    description:
      'Pushing a loaded sled away with the feet from a reclined seat. Heavy quad and glute work with the back fully supported, so it takes load without the balance demands of a squat.',
    tips: [
      'Feet shoulder width, mid-platform; higher hits more glute, lower more quad.',
      'Lower until the knees reach about 90° while the hips stay on the seat.',
      'Never lock the knees hard at the top.',
    ],
  },
  'romanian-deadlift': {
    description:
      'Starting from standing, the barbell slides down the thighs as the hips push back, and the hamstrings pull it back up. A hinge, not a squat: the knees barely move, and the stretch is the point.',
    tips: [
      'Push the hips back; the bar stays in contact with the legs.',
      'Go down only as far as a flat back allows.',
      'Stand up by driving the hips forward, not by lifting the chest.',
    ],
  },
  'goblet-squat': {
    description:
      'A squat holding one dumbbell against the chest. The front load keeps the torso upright and the depth honest, which makes it the best way to learn to squat and a solid working exercise on its own.',
    tips: [
      'Hold the dumbbell high, elbows tucked under it.',
      'Sit between the heels and let the elbows pass inside the knees.',
      'Keep the chest up all the way down and all the way up.',
    ],
  },
  'leg-extension': {
    description:
      'Seated, the shins lift a padded arm until the legs are straight. Pure quads with nothing else helping, which is why it works for pumping them up after the heavy work, or waking them up before it.',
    tips: [
      'Line the knee up with the machine’s pivot point.',
      'Pause and squeeze at the top for a beat.',
      'Lower slowly; don’t let the stack slam.',
    ],
  },
  'leg-curl': {
    description:
      'Lying or seated, the heels pull a padded arm toward the glutes. Isolates the hamstrings through the knee, the part of their job the deadlift and the RDL don’t cover.',
    tips: [
      'Keep the hips pressed into the pad; lifting them cheats the range.',
      'Curl all the way in, then control the return.',
      'Pull the toes toward the shins for a stronger contraction.',
    ],
  },
  'calf-raise': {
    description:
      'Rising onto the balls of the feet against a load, from a full stretch at the bottom to a full point at the top. Slow reps and a long range build calves; bouncing does not.',
    tips: [
      'Drop the heels all the way down and hold the stretch.',
      'Rise as high as you can and pause at the top.',
      'Knees straight for the outer calves, bent for the inner.',
    ],
  },

  'hip-thrust': {
    description:
      'Upper back on a bench, a barbell across the hips, feet flat: drive the hips up until the body is a straight line from shoulders to knees, then lower under control. The most direct way to load the glutes, and the lift most glute programmes are built around.',
    tips: [
      'Chin tucked and ribs down — look at your knees, not the ceiling.',
      'Shins vertical at the top; move the feet until they are.',
      'Squeeze hard at the top for a full second before lowering.',
    ],
  },
  'glute-bridge': {
    description:
      'The floor version of the hip thrust: on your back, knees bent, feet flat, hips driven up until they lock out, then lowered. Bodyweight or a plate on the hips, and the first place to learn what a glute contraction feels like before loading a bar.',
    tips: [
      'Push through the heels, not the toes.',
      'Ribs down so the lower back stays out of it.',
      'Pause at the top; the squeeze is the exercise.',
    ],
  },

  // Shoulders
  'overhead-press': {
    description:
      'Pressing a barbell from the collarbones to arm’s length overhead while standing. The main builder of the front and side delts and the triceps, with the whole trunk working to keep the bar stacked over the feet.',
    tips: [
      'Grip just outside the shoulders, forearms vertical under the bar.',
      'Squeeze the glutes and brace so the lower back doesn’t arch.',
      'Push the head through once the bar passes the forehead.',
    ],
  },
  'arnold-press': {
    description:
      'A dumbbell press that starts with the palms facing you and rotates them forward on the way up. The turn lengthens the range and brings the front delts in earlier than a plain press.',
    tips: [
      'Start with the dumbbells at chin height, palms toward you.',
      'Rotate smoothly as you press; finish with the palms facing forward.',
      'Go lighter than a normal press; the rotation is the hard part.',
    ],
  },
  'lateral-raise': {
    description:
      'Standing with a dumbbell in each hand, the arms rise to the sides until parallel with the floor. The exercise for the side delts, and the one that gives shoulders their width.',
    tips: [
      'Lead with the elbows, not the hands.',
      'Stop at shoulder height; higher brings in the traps.',
      'Light weight, slow lowering, no swing.',
    ],
  },
  'front-raise': {
    description:
      'Dumbbells raised straight out in front to shoulder height, one or both at a time. Targets the front delts directly, though most pressing already works them hard, so this is usually a light finisher.',
    tips: [
      'Raise to eye level and no higher.',
      'Keep the torso still; a lean back means it’s too heavy.',
      'Lower under control rather than dropping.',
    ],
  },
  'rear-delt-fly': {
    description:
      'Bent over, the dumbbells are raised out to the sides with the arms nearly straight. Hits the rear delts and upper back that pressing ignores, and that keep the shoulders balanced and healthy.',
    tips: [
      'Hinge until the chest is almost parallel to the floor.',
      'Lead with the elbows out and back, thumbs pointing down.',
      'Squeeze at the top; the weight should feel almost too light.',
    ],
  },
  'face-pull': {
    description:
      'Pulling a rope from a high cable toward the face, elbows high and wide, so the hands finish beside the ears. Rear delts, rotator cuff and upper back: the exercise that keeps pressing shoulders healthy.',
    tips: [
      'Set the pulley at eye level or a little above.',
      'Pull the rope apart as it comes toward your face.',
      'Finish with the knuckles beside the ears, elbows high.',
    ],
  },
  shrug: {
    description:
      'Standing with a dumbbell in each hand, the shoulders lift straight up toward the ears and lower again. Simple, heavy trap work: there is no rolling, only up and down.',
    tips: [
      'Straight up, pause, straight down; don’t roll the shoulders.',
      'Keep the arms relaxed; they’re hooks, not lifters.',
      'Chin slightly tucked so the neck stays out of it.',
    ],
  },

  // Biceps
  'barbell-curl': {
    description:
      'Standing with a barbell at arm’s length, the elbows bend to bring the bar to the shoulders. The heaviest curl there is, and the one that builds the most biceps when it’s done strictly.',
    tips: [
      'Pin the elbows to the sides and keep them there.',
      'Curl until the forearms touch the biceps, then lower slowly.',
      'If the torso rocks, the bar is too heavy.',
    ],
  },
  'db-curl': {
    description:
      'Dumbbells curled from the sides to the shoulders, together or alternating. Each arm works on its own, and the wrist can turn on the way up for a fuller biceps contraction.',
    tips: [
      'Start with the palms facing in and turn them up as you curl.',
      'Keep the upper arm still; only the forearm moves.',
      'Lower fully so the arm straightens on every rep.',
    ],
  },
  'hammer-curl': {
    description:
      'A dumbbell curl with the palms facing each other the whole way, like holding a hammer. Shifts the work to the brachialis and forearms, which thicken the arm from the side.',
    tips: [
      'Thumbs up throughout; don’t turn the wrists.',
      'Curl across toward the opposite shoulder for a change of angle.',
      'Squeeze at the top and lower over two or three seconds.',
    ],
  },
  'preacher-curl': {
    description:
      'Curling with the upper arms resting on an angled pad, which removes any help from the shoulders or the back. The stretched start makes the bottom of the rep the hard part.',
    tips: [
      'Set the pad so the armpits sit at its top edge.',
      'Lower until the arms are nearly straight, but not locked.',
      'Don’t lift the elbows off the pad as you curl.',
    ],
  },
  'incline-db-curl': {
    description:
      'Lying back on an incline bench with the arms hanging behind the body, each dumbbell is curled up from a full stretch. The long head of the biceps gets a stretch no standing curl can give it.',
    tips: [
      'Bench at about 45°, arms hanging straight down behind you.',
      'Keep the elbows back; don’t let them drift forward as you curl.',
      'Go lighter than a standing curl and feel the stretch at the bottom.',
    ],
  },

  // Triceps
  'triceps-pushdown': {
    description:
      'Standing at a high cable, the bar or rope is pushed down until the arms are straight, with the elbows pinned at the sides. The most direct triceps exercise there is.',
    tips: [
      'Elbows stay glued to the ribs; only the forearms move.',
      'Straighten the arms fully and squeeze at the bottom.',
      'Let the bar rise only to chest height; higher pulls the elbows up.',
    ],
  },
  'skull-crusher': {
    description:
      'Lying on a bench, the barbell is lowered toward the forehead by bending the elbows, then pressed back up. A heavy triceps builder; the name is a warning about what happens if the elbows flare.',
    tips: [
      'Lower to the forehead or just behind it, elbows pointing at the ceiling.',
      'Keep the upper arms still; don’t turn it into a press.',
      'Use an EZ bar if a straight bar hurts the wrists.',
    ],
  },
  'close-grip-bench': {
    description:
      'The bench press with the hands about shoulder width. The narrow grip keeps the elbows tucked and hands most of the work to the triceps, while the chest still helps move real weight.',
    tips: [
      'Hands just inside shoulder width; no narrower.',
      'Tuck the elbows and lower the bar to the lower chest.',
      'Drive to full lockout to finish the triceps.',
    ],
  },
  'triceps-dip': {
    description:
      'Dips done upright between the bars, torso vertical and elbows close, so the triceps carry the lift. Bodyweight at first, then add a belt.',
    tips: [
      'Stay upright; a forward lean turns it into a chest dip.',
      'Lower until the elbows reach 90°.',
      'Lock out fully at the top.',
    ],
  },
  'overhead-db-extension': {
    description:
      'Holding one dumbbell in both hands overhead, it’s lowered behind the head and pressed back up. Works the long head of the triceps in its stretched position, which nothing done at the sides can reach.',
    tips: [
      'Elbows pointing forward and kept close to the head.',
      'Lower until you feel the stretch behind the arm, then press.',
      'Keep the ribs down; don’t arch the back to get the weight up.',
    ],
  },

  // Core
  plank: {
    description:
      'Holding a straight line from head to heels on the forearms and toes. The trunk works to stop the hips sagging or the back arching; it’s logged here as a timed hold.',
    tips: [
      'Squeeze the glutes and tuck the ribs to keep the back flat.',
      'Push the forearms into the floor so the shoulders don’t collapse.',
      'Breathe; a held breath makes the hold shorter, not stronger.',
    ],
  },
  'hanging-leg-raise': {
    description:
      'Hanging from a bar, the legs are raised until they’re parallel to the floor or higher. The lower abs and hip flexors do the lifting; the rest of the trunk works to stop any swing.',
    tips: [
      'Start each rep from a dead hang with no swing.',
      'Curl the pelvis up at the top, not just the legs.',
      'Bend the knees to make it easier; straighten them to make it harder.',
    ],
  },
  'ab-wheel': {
    description:
      'Kneeling with a wheel on the floor, it rolls forward until the body is nearly flat, then back. The abs work harder than in any crunch to hold the spine as the lever gets longer.',
    tips: [
      'Tuck the hips and brace before you roll out.',
      'Go only as far as you can without the lower back sagging.',
      'Pull back with the abs, not by sitting the hips back.',
    ],
  },
  'cable-crunch': {
    description:
      'Kneeling under a high cable with the rope held at the head, the torso curls down toward the knees. The one crunch that loads properly, because the stack lets the weight go up.',
    tips: [
      'Keep the hips still; the spine curls, the hips don’t hinge.',
      'Bring the elbows toward the thighs and squeeze the abs.',
      'Return slowly to a tall kneel for a stretch at the top.',
    ],
  },
  'russian-twist': {
    description:
      'Seated with the feet off the floor and a weight in the hands, the torso rotates side to side. Trains the obliques through rotation, which nothing else in a straight-line workout does.',
    tips: [
      'Lean back to about 45° and keep the chest up.',
      'Turn the shoulders, not just the arms, and touch the weight down each side.',
      'Slow and controlled beats fast and sloppy.',
    ],
  },
};
