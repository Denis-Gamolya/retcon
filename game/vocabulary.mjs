/** Curated phrases share one grammar: character + action + object. */
function category(families) {
  return Object.entries(families).flatMap(([family, labels]) =>
    labels.map((label) => ({
      id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label,
      family,
    })),
  );
}

export const vocabulary = {
  character: category({
    'Pointed ears and tails': ['A cat', 'A fox', 'A dog', 'A wolf', 'A coyote', 'A husky', 'A corgi', 'A chihuahua'],
    'Round ears and whiskers': ['A mouse', 'A hamster', 'A rat', 'A guinea pig', 'A chinchilla'],
    'Long ears and hopping legs': ['A rabbit', 'A kangaroo', 'A hare'],
    'Bushy tails': ['A raccoon', 'A squirrel', 'A skunk', 'A beaver'],
    'Round heads and heavy bodies': ['A bear', 'A panda', 'A polar bear', 'A gorilla', 'A koala', 'A teddy bear'],
    'Big cats': ['A lion', 'A tiger', 'A cheetah', 'A leopard'],
    'Hooves and long faces': ['A horse', 'A donkey', 'A zebra', 'A unicorn', 'A deer', 'A moose', 'A reindeer', 'An antelope'],
    'Long necks and legs': ['A giraffe', 'A llama', 'A camel', 'An ostrich'],
    'Heavy four-legged bodies': ['An elephant', 'A rhinoceros', 'A hippopotamus', 'A mammoth'],
    'Round bodies and wings': ['A penguin', 'An owl', 'A chicken', 'A pigeon', 'A parrot', 'A puffin', 'A robin', 'A sparrow', 'A canary'],
    'Long necks and beaks': ['A duck', 'A goose', 'A swan', 'A flamingo', 'A stork', 'A heron', 'A duckling', 'A crane'],
    'Fins and pointed noses': ['A shark', 'A dolphin', 'A whale', 'An orca', 'A swordfish', 'A narwhal', 'A hammerhead shark'],
    'Round bodies and flippers': ['A seal', 'A walrus', 'An otter', 'A manatee', 'A sea lion'],
    'Many arms or legs': ['An octopus', 'A squid', 'A crab', 'A lobster', 'A spider', 'A jellyfish', 'A starfish'],
    'Spiky backs and long tails': ['A dinosaur', 'A dragon', 'A crocodile', 'A lizard'],
    'Big eyes and squat bodies': ['An alien', 'A frog', 'A toad', 'A gecko', 'A chameleon', 'An iguana'],
    'Robes and tall headwear': ['A wizard', 'A witch', 'A fairy', 'A princess', 'A queen'],
    'Hats and uniforms': ['A pirate', 'A chef', 'A firefighter', 'A cowboy', 'A detective', 'A police officer', 'A builder', 'A farmer', 'A nurse', 'A doctor', 'A mail carrier', 'A sailor', 'A security guard'],
    'Bulky suits and helmets': ['An astronaut', 'A diver', 'A knight', 'A robot', 'A beekeeper'],
    'Flowing capes': ['A superhero', 'A vampire', 'A magician', 'A king', 'A superhero sidekick'],
    'Stiff or stitched figures': ['A skeleton', 'A mummy', 'A werewolf', 'A zombie', 'A scarecrow', 'A gingerbread man'],
    'Simple rounded figures': ['A ghost', 'A snowman', 'A slime monster'],
    'Shells and low bodies': ['A turtle', 'A tortoise', 'A snail', 'A hermit crab', 'An armadillo'],
    'Tiny bodies and patterned wings': ['A butterfly', 'A moth', 'A bee', 'A ladybug', 'A dragonfly', 'A mosquito'],
    'Small bodies and bent legs': ['An ant', 'A grasshopper', 'A cricket', 'A beetle', 'A praying mantis'],
    'Long curling bodies': ['A snake', 'A worm', 'A caterpillar', 'An eel'],
    'Wide wings and little feet': ['A bat', 'An eagle', 'A seagull', 'A crow', 'A pelican', 'A vulture'],
    'Small fins and fan tails': ['A goldfish', 'A clownfish', 'A piranha', 'A pufferfish'],
    'Short legs and round snouts': ['A pig', 'A wild boar', 'A wombat', 'A capybara'],
    'Wool and curved horns': ['A sheep', 'A goat', 'A ram', 'A yak', 'A bison', 'A cow', 'A bull'],
    'Spines and small snouts': ['A hedgehog', 'A porcupine', 'An echidna'],
    'Big ears and monkey tails': ['A monkey', 'A chimpanzee', 'A lemur'],
    'Masks and tight suits': ['A ninja', 'A wrestler', 'A fencer'],
    'Puffy costumes and painted faces': ['A clown', 'A jester', 'A mime'],
    'Aprons and work clothes': ['A baker', 'A butcher', 'A gardener', 'A blacksmith', 'A mechanic'],
    'Helmets and sports uniforms': ['A football player', 'A baseball player', 'A hockey player', 'A skateboarder', 'A cyclist', 'A tennis player', 'A basketball player', 'A goalkeeper'],
    'Crests and small wings': ['A rooster', 'A turkey', 'A peacock'],
    'Beards and pointed hats': ['A gnome', 'An elf', 'A leprechaun', 'A dwarf'],
  }),
  action: category({
    'Working on something': ['is repairing', 'is inspecting', 'is cleaning', 'is painting', 'is building', 'is decorating'],
    'Hands on': ['is carrying', 'is lifting', 'is hugging', 'is stealing', 'is pushing', 'is pulling'],
    'Near the face': ['is eating', 'is smelling', 'is kissing', 'is licking', 'is drinking from'],
    'Play and movement': ['is chasing', 'is riding', 'is kicking', 'is throwing', 'is catching', 'is juggling'],
    'Taking a position': ['is hiding behind', 'is sitting on', 'is standing on', 'is balancing on', 'is sleeping beside', 'is crawling under'],
    'Making a scene': ['is dancing with', 'is singing to', 'is arguing with', 'is photographing', 'is drawing'],
  }),
  object: category({
    'Two wheels and a frame': ['a bicycle', 'a motorcycle', 'a scooter', 'a wheelchair'],
    'Low decks and small wheels': ['a skateboard', 'a roller skate', 'a toy car', 'a rollerblade', 'a skateboard deck'],
    'Boxes on wheels': ['a shopping cart', 'a stroller', 'a wheelbarrow', 'a wagon'],
    'Large wheels and a cab': ['a tractor', 'a truck', 'a bus', 'a fire engine', 'a car', 'a bulldozer', 'a taxi', 'an ambulance', 'a school bus'],
    'Round ends on handles': ['a balloon', 'a lollipop', 'a magnifying glass', 'a frying pan', 'a tennis racket', 'a handheld mirror', 'a microphone', 'a table tennis paddle'],
    'Small boxes with a front panel': ['a television', 'a microwave', 'an aquarium', 'a safe', 'a washing machine', 'a radio', 'a toaster', 'a computer monitor'],
    'Tall doors and panels': ['a refrigerator', 'a vending machine', 'a wardrobe', 'a locker', 'a grandfather clock'],
    'Lidded boxes': ['a suitcase', 'a treasure chest', 'a lunchbox', 'a toolbox', 'a gift box', 'a cardboard box', 'a briefcase', 'a jewelry box', 'a picnic basket'],
    'Flat circles': ['a pizza', 'a pancake', 'a plate', 'a coin', 'a clock', 'a frisbee', 'a cookie', 'a paper plate', 'a flying saucer'],
    'Rings with a hole': ['a doughnut', 'a tire', 'a life ring', 'a bagel', 'a ring', 'a swimming ring', 'a bracelet'],
    'Round marked balls': ['a basketball', 'a beach ball', 'a globe', 'a disco ball', 'a pumpkin', 'a bowling ball', 'a watermelon', 'a tennis ball', 'a soccer ball', 'an orange'],
    'Stacked layers': ['a birthday cake', 'a sandwich', 'a hamburger', 'a stack of books', 'a stack of pancakes', 'a cheeseburger'],
    'Triangle shapes': ['an ice cream cone', 'a party hat', 'a traffic cone', 'a slice of cheese', 'a tent', 'a pyramid', 'a nacho', 'a slice of cake', 'a pizza slice', 'a tortilla chip'],
    'Long handles with broad ends': ['a broom', 'a mop', 'a shovel', 'an axe', 'a rake', 'a pitchfork', 'a snow shovel'],
    'Straight sticks with a grip': ['a sword', 'a baseball bat', 'a magic wand', 'a toothbrush', 'a paintbrush', 'a screwdriver', 'a crayon', 'a pencil', 'a marker'],
    'Domes on a stalk': ['an umbrella', 'a mushroom', 'a table lamp'],
    'Bent or hooked sticks': ['a fishing rod', 'a walking cane', 'a golf club', 'a hockey stick', 'a crowbar', 'a candy cane', 'a shepherd’s crook'],
    'Pointed tubes and fins': ['a spaceship', 'a submarine', 'a rocket', 'an airplane', 'a blimp', 'a paper airplane', 'a space shuttle'],
    'Boat hulls': ['a canoe', 'a sailboat', 'a rowboat', 'a paper boat', 'a pirate ship', 'a kayak', 'a cruise ship'],
    'Rotors and crossed blades': ['a helicopter', 'an electric fan', 'a windmill', 'a drone', 'a ceiling fan'],
    'Open cups and bowls': ['a flowerpot', 'a bucket', 'a coffee mug', 'a trophy', 'a bowl', 'a wastebasket', 'a basket', 'a cereal bowl', 'a soup bowl'],
    'Handles and spouts': ['a teapot', 'a watering can', 'a kettle', 'a pitcher', 'a gravy boat'],
    'Seats and backs': ['a chair', 'a sofa', 'a bench', 'an armchair', 'a toilet', 'a rocking chair', 'a folding chair'],
    'Flat tops on legs': ['a table', 'a piano', 'a bed', 'a desk', 'an ironing board'],
    'Deep tubs and basins': ['a bathtub', 'a sink', 'a swimming pool'],
    'Curved arcs': ['a banana', 'a crescent moon', 'a boomerang', 'a croissant', 'a horseshoe', 'a rainbow'],
    'Short teeth and bristles': ['a comb', 'a fork', 'a hairbrush'],
    'Soft bulges': ['a pillow', 'a cloud', 'a stick of cotton candy', 'a sack'],
    'Folded rectangles': ['a book', 'a laptop', 'a wallet', 'an envelope', 'a newspaper'],
    'Paired loops': ['a pair of scissors', 'a pair of pliers', 'a pair of sunglasses', 'a pair of handcuffs'],
    'Bottles and narrow necks': ['a water bottle', 'a soda bottle', 'a bowling pin', 'a vase'],
    'Curled and coiled shapes': ['a seashell', 'a cinnamon roll', 'a coiled rope', 'a ball of yarn'],
    'Points and spokes': ['a star', 'a snowflake', 'a sun', 'a pinwheel'],
    'Shoes and tall cuffs': ['a boot', 'a sneaker', 'a high heel', 'an ice skate', 'a sock', 'a rain boot', 'a slipper'],
    'Brims and rounded crowns': ['a top hat', 'a cowboy hat', 'a baseball cap', 'a helmet', 'a sombrero', 'a bowler hat', 'a beret', 'a sun hat'],
    'Tops with sleeves': ['a T-shirt', 'a sweater', 'a jacket', 'a bathrobe', 'a raincoat', 'a hoodie'],
    'Fabric with straps': ['a backpack', 'a handbag', 'an apron', 'a shopping bag', 'a shoulder bag'],
    'Broad leaves and branching stems': ['a tree', 'a cactus', 'a palm tree', 'a sunflower', 'a rose', 'a fern'],
    'Pointed leaves and oval bodies': ['a pineapple', 'a strawberry', 'a carrot', 'a radish', 'a turnip'],
    'Round fruit with stems': ['an apple', 'a pear', 'a peach', 'a cherry', 'a lemon', 'a plum', 'a lime', 'an apricot'],
    'Clustered round shapes': ['a bunch of grapes', 'a head of broccoli', 'a cauliflower', 'a bunch of balloons'],
    'Long rounded foods': ['a hot dog', 'a cucumber', 'a corn cob', 'a baguette', 'a sausage'],
    'Square food grids': ['a waffle', 'a Rubik’s cube', 'a chocolate bar', 'an ice cube tray'],
    'Thin sheets and folded corners': ['a map', 'a poster', 'a towel', 'a blanket', 'a sheet of paper'],
    'Frames with crossed lines': ['a kite', 'a window', 'a picture frame', 'a fence', 'a ladder', 'a tennis net'],
    'Strings on a hollow body': ['a guitar', 'a violin', 'a ukulele', 'a banjo', 'a cello'],
    'Long tubes and bells': ['a trumpet', 'a trombone', 'a saxophone', 'a flute', 'a recorder'],
    'Round drums and stretched skins': ['a drum', 'a tambourine', 'a bongo drum'],
    'Squeezed boxes and keys': ['an accordion', 'a keyboard', 'a typewriter'],
    'Small boxes with a lens': ['a camera', 'a projector', 'a pair of binoculars'],
    'Buttons on handheld rectangles': ['a phone', 'a remote control', 'a calculator', 'a game console', 'a walkie-talkie'],
    'Cords and rounded pads': ['a pair of headphones', 'a stethoscope', 'a pair of earmuffs'],
    'Small flames and holders': ['a candle', 'a torch', 'a lantern', 'a match'],
    'Caps and cylindrical bodies': ['a flashlight', 'a battery', 'a glue stick', 'a salt shaker', 'a pepper grinder', 'a lipstick', 'a fire extinguisher'],
    'Handles on chunky heads': ['a hammer', 'a hair dryer', 'a water pistol', 'a stapler', 'a rubber mallet'],
    'Small teeth and open jaws': ['a key', 'a wrench', 'a bottle opener'],
    'Peaks and sloping sides': ['a mountain', 'a volcano', 'a sandcastle', 'a pile of sand'],
    'Roofs over simple walls': ['a house', 'a doghouse', 'a birdhouse', 'a barn', 'a garden shed', 'a greenhouse'],
    'Tall columns and platforms': ['a lighthouse', 'a water tower', 'a streetlight', 'a traffic light'],
    'Tracks and linked cars': ['a train', 'a roller coaster', 'a toy train'],
    'Points around a band': ['a crown', 'a tiara', 'a paper crown'],
    'Handles and scoops': ['a spoon', 'a ladle', 'an ice cream scoop'],
    'Hanging seats and frames': ['a swing', 'a hammock', 'a hanging chair'],
  }),
};

// Familiar mode keeps whole visual families, preserving plausible bluff choices.
const familiarFamilies = new Set([
  'Pointed ears and tails', 'Round ears and whiskers', 'Long ears and hopping legs',
  'Round heads and heavy bodies', 'Big cats', 'Hooves and long faces',
  'Heavy four-legged bodies', 'Round bodies and wings', 'Long necks and beaks',
  'Fins and pointed noses', 'Many arms or legs', 'Hats and uniforms',
  'Bulky suits and helmets', 'Flowing capes', 'Simple rounded figures',
  'Tiny bodies and patterned wings', 'Long curling bodies', 'Wool and curved horns',
  'Two wheels and a frame', 'Boxes on wheels', 'Large wheels and a cab',
  'Lidded boxes', 'Flat circles', 'Rings with a hole', 'Round marked balls',
  'Stacked layers', 'Triangle shapes', 'Long handles with broad ends',
  'Straight sticks with a grip', 'Domes on a stalk', 'Boat hulls',
  'Open cups and bowls', 'Seats and backs', 'Flat tops on legs', 'Curved arcs',
  'Bottles and narrow necks', 'Shoes and tall cuffs', 'Brims and rounded crowns',
  'Broad leaves and branching stems', 'Round fruit with stems',
  'Strings on a hollow body', 'Roofs over simple walls', 'Handles and scoops',
  'Points around a band',
]);
for (const [slot, words] of Object.entries(vocabulary)) {
  for (const word of words) word.familiar = slot === 'action' || familiarFamilies.has(word.family);
}

/** Return the selectable words for a room's vocabulary setting. */
export function promptChoices(slot, pool = 'all') {
  return vocabulary[slot].filter((word) => pool !== 'familiar' || word.familiar);
}

export const slots = ['character', 'action', 'object'];

export function phrase(prompt) {
  return slots.map((slot) => vocabulary[slot].find((entry) => entry.id === prompt[slot])?.label ?? '').join(' ');
}

export function isTruth(original, claim) {
  return slots.every((slot) => original[slot] === claim[slot]);
}

/** Reject arbitrary text, category swaps, and changes to the locked slot. */
export function validateClaim(original, claim, lockedSlot) {
  if (!claim || typeof claim !== 'object') throw new Error('Choose a phrase for each part.');
  for (const slot of slots) {
    if (!vocabulary[slot].some((entry) => entry.id === claim[slot])) {
      throw new Error(`Choose a valid ${slot} from the library.`);
    }
  }
  if (claim[lockedSlot] !== original[lockedSlot]) {
    throw new Error('The locked part must stay unchanged.');
  }
  return Object.fromEntries(slots.map((slot) => [slot, claim[slot]]));
}
