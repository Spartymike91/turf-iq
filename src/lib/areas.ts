// Shared course-area list — the same dropdown data used everywhere an
// application log needs to say where it happened (Fertility, Pest & Weed),
// so "Greens" means the same option in both places instead of each page
// collecting its own free-text zone name.
export const COURSE_AREAS = [
  "Greens",
  "Tees",
  "Fairways",
  "Rough",
  "Bunkers",
  "Practice Facility",
  "Clubhouse Grounds",
  "Other",
] as const;

export type CourseArea = (typeof COURSE_AREAS)[number];
