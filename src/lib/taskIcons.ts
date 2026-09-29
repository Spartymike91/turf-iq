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
  // Mowing / turf
  "🌱", "🌾", "🌿", "🍃",
  // Bunkers / sand
  "🏖️", "🏜️",
  // Course setup / flags
  "⛳", "🚩", "🎌",
  // Irrigation / water
  "💦", "💧", "🚿", "🌧️",
  // Chemicals / spray
  "🧪", "⚗️",
  // Cultural practices
  "🌀", "✂️",
  // Equipment / vehicles
  "🔧", "🛠️", "⚙️", "🔩", "🚜", "🚛",
  // Grounds / cleaning
  "🍂", "🧹", "🗑️", "🧽",
  // Trees / landscaping
  "🌳", "🌲", "🪴", "🌷", "🌻",
  // Weather
  "☀️", "❄️", "🌪️", "⛈️",
  // Repair / maintenance
  "🩹", "🔨", "🪛",
  // Pests
  "🐛", "🐜", "🦗",
  // Staff / labor
  "👷", "🧑‍🌾",
  // Buildings / facilities
  "🏠", "🚪",
  // Time / schedule
  "⏰", "📅",
  // General
  "⭐", "✅", "📋", "🎯",
];
