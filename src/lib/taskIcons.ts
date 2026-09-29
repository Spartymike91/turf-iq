// Curated set for the Task Library icon picker — deliberately not a full
// generic emoji library (Smileys/Animals/Food/etc. would be almost all
// irrelevant noise for a golf course task list). Built from the icons
// already used across DEFAULT_TASK_LIBRARY (Mowing, Bunkers, Course Setup,
// Cultural Practices, Grounds, Irrigation, Equipment) and extended with
// enough coverage for the custom tasks a course is likely to add —
// chemicals/spray, vehicles, trees/landscaping, weather, staff, pests,
// buildings — so "pick an icon like the pre-loaded ones" actually has
// somewhere to reach beyond that original 10-icon set. Same fixed-palette
// spirit as EVENT_COLORS/NOTE_CATEGORIES/GRASS_TYPES elsewhere in this app.
export const TASK_ICON_OPTIONS: string[] = [
  // Mowing / turf — no standard "lawn mower" emoji exists in Unicode as of
  // this writing, so 🚜 (tractor, under Equipment/vehicles below) is the
  // closest fit for mowing equipment specifically.
  "🌱", "🌾", "🌿", "🍃", "🍀",
  // Golf / play
  "🏌️", "🕳️",
  // Bunkers / sand
  "🏖️", "🏜️",
  // Course setup / flags
  "⛳", "🚩", "🎌", "🚧",
  // Water features / hazards
  "🌊", "⛲",
  // Irrigation / water
  "💦", "💧", "🚿", "🌧️", "🚰",
  // Chemicals / spray
  "🧪", "⚗️",
  // Cultural practices
  "🌀", "✂️",
  // Equipment / vehicles
  "🔧", "🛠️", "⚙️", "🔩", "🚜", "🚛", "🛻", "🧰", "🪣", "⛽", "🔋",
  // Grounds / cleaning
  "🍂", "🧹", "🗑️", "🧽", "♻️",
  // Trees / landscaping
  "🌳", "🌲", "🪴", "🌷", "🌻",
  // Weather
  "☀️", "❄️", "🌪️", "⛈️", "🌡️", "💨",
  // Repair / maintenance
  "🩹", "🔨", "🪛", "💡",
  // Pests / wildlife
  "🐛", "🐜", "🦗", "🐝", "🦆", "🐸", "🐿️",
  // Staff / labor
  "👷", "🧑‍🌾",
  // Buildings / facilities
  "🏠", "🚪",
  // Navigation / location
  "🗺️", "📍",
  // Time / schedule
  "⏰", "📅",
  // General
  "⭐", "✅", "📋", "🎯",
];
