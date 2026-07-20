-- ============================================
-- TURF IQ — Supabase Database Schema
-- ============================================
-- Run this in your Supabase SQL Editor:
-- 1. Go to https://supabase.com/dashboard
-- 2. Select your project
-- 3. Click "SQL Editor" in the left sidebar
-- 4. Paste this entire file and click "Run"
-- ============================================

-- User profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Golf courses
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT,
  state TEXT,
  climate_zone TEXT,
  grass_type TEXT,
  num_holes INTEGER DEFAULT 18,
  maintained_acres NUMERIC(6,1),
  annual_rounds INTEGER,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Course membership (who can access which course, and their role)
CREATE TABLE IF NOT EXISTS course_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'superintendent', 'assistant', 'crew_lead', 'crew')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_id, user_id)
);

-- Employees (managed per course — these are staff, not necessarily app users)
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  role TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('FT', 'PT', 'SEA')),
  hourly_rate NUMERIC(6,2) NOT NULL,
  color TEXT DEFAULT '#3b5bdb',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Annual budget by category, per fiscal year
CREATE TABLE IF NOT EXISTS budget_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  annual_budget NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_id, name, fiscal_year)
);

-- Individual expense log entries, each tied to a budget category
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES budget_categories(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  description TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Annual nitrogen program target, per fiscal year
CREATE TABLE IF NOT EXISTS fertility_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  fiscal_year INTEGER NOT NULL,
  annual_n_target NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_id, fiscal_year)
);

-- Fertilizer application log
CREATE TABLE IF NOT EXISTS fertilizer_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  zone TEXT NOT NULL,
  product TEXT NOT NULL,
  n_lbs_per_1000 NUMERIC(5,2) NOT NULL DEFAULT 0,
  cost NUMERIC(10,2),
  application_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Soil test results by zone
CREATE TABLE IF NOT EXISTS soil_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  zone TEXT NOT NULL,
  test_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ph NUMERIC(3,1),
  phosphorus_ppm NUMERIC(6,1),
  potassium_ppm NUMERIC(6,1),
  iron_ppm NUMERIC(6,1),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Daily GDD log, accumulated in real time as the weather integration runs
CREATE TABLE IF NOT EXISTS gdd_daily_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  log_date DATE NOT NULL,
  gdd NUMERIC(6,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_id, log_date)
);

-- Scheduled/assigned task instances (from the task_templates library, or ad-hoc)
CREATE TABLE IF NOT EXISTS task_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES task_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL DEFAULT CURRENT_DATE,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'complete')),
  estimated_minutes INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Time clock entries (kiosk-operated — employees aren't app users)
CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Equipment fleet
CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  make TEXT,
  model TEXT,
  serial_number TEXT,
  current_hours NUMERIC(8,1) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Maintenance schedule items per piece of equipment (manual or AI-suggested draft)
CREATE TABLE IF NOT EXISTS maintenance_schedule_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE NOT NULL,
  task TEXT NOT NULL,
  interval_hours NUMERIC(6,0),
  interval_days NUMERIC(6,0),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('ai_suggested', 'manual', 'ai_suggested_edited')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Completed maintenance/service history
CREATE TABLE IF NOT EXISTS maintenance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE NOT NULL,
  task TEXT NOT NULL,
  performed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  hours_at_service NUMERIC(8,1),
  cost NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pesticide/herbicide application log with REI (restricted-entry interval) tracking
CREATE TABLE IF NOT EXISTS pest_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  target TEXT NOT NULL,
  product TEXT NOT NULL,
  rei_hours INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Annual water budget target, per fiscal year
CREATE TABLE IF NOT EXISTS irrigation_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  fiscal_year INTEGER NOT NULL,
  annual_water_budget_gal NUMERIC(12,0) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_id, fiscal_year)
);

-- Irrigation cycle log
CREATE TABLE IF NOT EXISTS irrigation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  cycle_date DATE NOT NULL DEFAULT CURRENT_DATE,
  gallons NUMERIC(10,0) NOT NULL,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Soil moisture readings by zone (manually logged — no sensor integration yet)
CREATE TABLE IF NOT EXISTS soil_moisture_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  zone TEXT NOT NULL,
  reading_date DATE NOT NULL DEFAULT CURRENT_DATE,
  vwc_pct NUMERIC(4,1) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Short-lived cache of computed weather results, to avoid re-hitting NWS on
-- every page load / chat message. Any course member can read or refresh it
-- (it's a technical cache of public weather data, not a business record).
CREATE TABLE IF NOT EXISTS weather_cache (
  course_id UUID PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Task library (reusable task templates per course)
CREATE TABLE IF NOT EXISTS task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  icon TEXT,
  name TEXT NOT NULL,
  frequency TEXT,
  estimated_duration TEXT,
  equipment TEXT,
  materials TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- SECURITY DEFINER helpers for course_members checks.
-- These run as the function owner (which owns the tables and bypasses RLS),
-- so they can be used inside course_members' own policies without the
-- self-referencing subquery causing "infinite recursion detected in policy".
CREATE OR REPLACE FUNCTION public.is_course_member(target_course_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM course_members
    WHERE course_id = target_course_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_course_owner(target_course_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM course_members
    WHERE course_id = target_course_id AND user_id = auth.uid() AND role = 'owner'
  );
$$;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE fertility_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fertilizer_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE soil_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdd_daily_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE irrigation_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE irrigation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE soil_moisture_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pest_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;

-- Profiles: users can manage their own
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Courses: any authenticated user can create; members can view; owners can update
CREATE POLICY "Any authenticated user can create a course"
  ON courses FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Members can view their courses"
  ON courses FOR SELECT USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = courses.id AND user_id = auth.uid())
  );
CREATE POLICY "Owners can update courses"
  ON courses FOR UPDATE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = courses.id AND user_id = auth.uid() AND role = 'owner')
  );

-- Course members: owners can manage; members can view fellow members
CREATE POLICY "Members can view fellow members"
  ON course_members FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners can insert members"
  ON course_members FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (
      role = 'owner' OR public.is_course_owner(course_id)
    )
  );
CREATE POLICY "Owners can delete members"
  ON course_members FOR DELETE USING (public.is_course_owner(course_id));

-- Employees: members can view; owners/supers can manage
CREATE POLICY "Members can view employees"
  ON employees FOR SELECT USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = employees.course_id AND user_id = auth.uid())
  );
CREATE POLICY "Owners and supers can insert employees"
  ON employees FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = employees.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can update employees"
  ON employees FOR UPDATE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = employees.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can delete employees"
  ON employees FOR DELETE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = employees.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

-- Budget categories: same pattern as employees
CREATE POLICY "Members can view budget categories"
  ON budget_categories FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners and supers can insert budget categories"
  ON budget_categories FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = budget_categories.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can update budget categories"
  ON budget_categories FOR UPDATE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = budget_categories.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can delete budget categories"
  ON budget_categories FOR DELETE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = budget_categories.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

-- Expenses: same pattern as employees
CREATE POLICY "Members can view expenses"
  ON expenses FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners and supers can insert expenses"
  ON expenses FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = expenses.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can update expenses"
  ON expenses FOR UPDATE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = expenses.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can delete expenses"
  ON expenses FOR DELETE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = expenses.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

-- Fertility programs: same pattern as employees
CREATE POLICY "Members can view fertility programs"
  ON fertility_programs FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners and supers can insert fertility programs"
  ON fertility_programs FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = fertility_programs.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can update fertility programs"
  ON fertility_programs FOR UPDATE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = fertility_programs.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

-- Fertilizer applications: same pattern as employees
CREATE POLICY "Members can view fertilizer applications"
  ON fertilizer_applications FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners and supers can insert fertilizer applications"
  ON fertilizer_applications FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = fertilizer_applications.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can delete fertilizer applications"
  ON fertilizer_applications FOR DELETE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = fertilizer_applications.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

-- Soil tests: same pattern as employees
CREATE POLICY "Members can view soil tests"
  ON soil_tests FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners and supers can insert soil tests"
  ON soil_tests FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = soil_tests.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can delete soil tests"
  ON soil_tests FOR DELETE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = soil_tests.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

-- GDD daily log: members can view; owners/supers can insert (upserted by the weather integration)
CREATE POLICY "Members can view gdd log"
  ON gdd_daily_log FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners and supers can insert gdd log"
  ON gdd_daily_log FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = gdd_daily_log.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can update gdd log"
  ON gdd_daily_log FOR UPDATE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = gdd_daily_log.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

-- Weather cache: any member can read or write (technical cache, not a business record)
CREATE POLICY "Members can view weather cache"
  ON weather_cache FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Members can insert weather cache"
  ON weather_cache FOR INSERT WITH CHECK (public.is_course_member(course_id));
CREATE POLICY "Members can update weather cache"
  ON weather_cache FOR UPDATE USING (public.is_course_member(course_id));

-- Irrigation programs: same pattern as employees
CREATE POLICY "Members can view irrigation programs"
  ON irrigation_programs FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners and supers can insert irrigation programs"
  ON irrigation_programs FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = irrigation_programs.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can update irrigation programs"
  ON irrigation_programs FOR UPDATE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = irrigation_programs.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

-- Irrigation logs: same pattern as employees
CREATE POLICY "Members can view irrigation logs"
  ON irrigation_logs FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners and supers can insert irrigation logs"
  ON irrigation_logs FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = irrigation_logs.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can delete irrigation logs"
  ON irrigation_logs FOR DELETE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = irrigation_logs.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

-- Soil moisture readings: same pattern as employees
CREATE POLICY "Members can view soil moisture readings"
  ON soil_moisture_readings FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners and supers can insert soil moisture readings"
  ON soil_moisture_readings FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = soil_moisture_readings.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can delete soil moisture readings"
  ON soil_moisture_readings FOR DELETE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = soil_moisture_readings.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

-- Pest applications: same pattern as employees
CREATE POLICY "Members can view pest applications"
  ON pest_applications FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners and supers can insert pest applications"
  ON pest_applications FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = pest_applications.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can delete pest applications"
  ON pest_applications FOR DELETE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = pest_applications.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

-- Equipment: same pattern as employees
CREATE POLICY "Members can view equipment"
  ON equipment FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners and supers can insert equipment"
  ON equipment FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = equipment.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can update equipment"
  ON equipment FOR UPDATE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = equipment.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can delete equipment"
  ON equipment FOR DELETE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = equipment.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

-- Maintenance schedule items: join through equipment for course scoping
CREATE POLICY "Members can view maintenance schedule items"
  ON maintenance_schedule_items FOR SELECT USING (
    EXISTS (SELECT 1 FROM equipment e WHERE e.id = maintenance_schedule_items.equipment_id AND public.is_course_member(e.course_id))
  );
CREATE POLICY "Owners and supers can insert maintenance schedule items"
  ON maintenance_schedule_items FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM equipment e JOIN course_members cm ON cm.course_id = e.course_id WHERE e.id = maintenance_schedule_items.equipment_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can update maintenance schedule items"
  ON maintenance_schedule_items FOR UPDATE USING (
    EXISTS (SELECT 1 FROM equipment e JOIN course_members cm ON cm.course_id = e.course_id WHERE e.id = maintenance_schedule_items.equipment_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can delete maintenance schedule items"
  ON maintenance_schedule_items FOR DELETE USING (
    EXISTS (SELECT 1 FROM equipment e JOIN course_members cm ON cm.course_id = e.course_id WHERE e.id = maintenance_schedule_items.equipment_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'superintendent'))
  );

-- Maintenance log: join through equipment for course scoping
CREATE POLICY "Members can view maintenance log"
  ON maintenance_log FOR SELECT USING (
    EXISTS (SELECT 1 FROM equipment e WHERE e.id = maintenance_log.equipment_id AND public.is_course_member(e.course_id))
  );
CREATE POLICY "Owners and supers can insert maintenance log"
  ON maintenance_log FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM equipment e JOIN course_members cm ON cm.course_id = e.course_id WHERE e.id = maintenance_log.equipment_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can delete maintenance log"
  ON maintenance_log FOR DELETE USING (
    EXISTS (SELECT 1 FROM equipment e JOIN course_members cm ON cm.course_id = e.course_id WHERE e.id = maintenance_log.equipment_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'superintendent'))
  );

-- Task assignments: same pattern as employees
CREATE POLICY "Members can view task assignments"
  ON task_assignments FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners and supers can insert task assignments"
  ON task_assignments FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = task_assignments.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can update task assignments"
  ON task_assignments FOR UPDATE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = task_assignments.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can delete task assignments"
  ON task_assignments FOR DELETE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = task_assignments.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

-- Time entries: same pattern as employees
CREATE POLICY "Members can view time entries"
  ON time_entries FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners and supers can insert time entries"
  ON time_entries FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = time_entries.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can update time entries"
  ON time_entries FOR UPDATE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = time_entries.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can delete time entries"
  ON time_entries FOR DELETE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = time_entries.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

-- Task templates: same pattern as employees
CREATE POLICY "Members can view task templates"
  ON task_templates FOR SELECT USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = task_templates.course_id AND user_id = auth.uid())
  );
CREATE POLICY "Owners and supers can insert task templates"
  ON task_templates FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = task_templates.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can update task templates"
  ON task_templates FOR UPDATE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = task_templates.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can delete task templates"
  ON task_templates FOR DELETE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = task_templates.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

-- ============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- TEAM / MEMBER MANAGEMENT (appended here; was run directly against the
-- live DB via the SQL editor and is being synced back into this file now)
-- ============================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id AND (p.email IS NULL OR p.email <> u.email);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_user_email_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET email = new.email, updated_at = now() WHERE id = new.id;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_email_update();

CREATE OR REPLACE FUNCTION public.is_course_superintendent(target_course_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM course_members
    WHERE course_id = target_course_id AND user_id = auth.uid() AND role = 'superintendent'
  );
$$;

CREATE OR REPLACE FUNCTION public.shares_any_course_with(target_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM course_members cm1
    JOIN course_members cm2 ON cm1.course_id = cm2.course_id
    WHERE cm1.user_id = auth.uid() AND cm2.user_id = target_user_id
  );
$$;

CREATE POLICY "Users can view course-mate profiles"
  ON profiles FOR SELECT USING (public.shares_any_course_with(id));

DROP POLICY IF EXISTS "Owners can insert members" ON course_members;
CREATE POLICY "course_members_insert_v2" ON course_members FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND (
    role = 'owner'
    OR public.is_course_owner(course_id)
    OR (public.is_course_superintendent(course_id) AND role IN ('assistant', 'crew_lead', 'crew'))
  )
);

CREATE POLICY "course_members_update_v1" ON course_members FOR UPDATE
  USING (
    public.is_course_owner(course_id)
    OR (public.is_course_superintendent(course_id) AND role IN ('assistant', 'crew_lead', 'crew'))
  )
  WITH CHECK (
    public.is_course_owner(course_id)
    OR (public.is_course_superintendent(course_id) AND role IN ('assistant', 'crew_lead', 'crew'))
  );

CREATE OR REPLACE FUNCTION public.prevent_last_owner_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'owner')
     OR (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role <> 'owner') THEN
    IF (SELECT COUNT(*) FROM course_members
        WHERE course_id = OLD.course_id AND role = 'owner' AND id <> OLD.id) = 0 THEN
      RAISE EXCEPTION 'Cannot remove or demote the last remaining owner of this course';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS course_members_last_owner_guard ON course_members;
CREATE TRIGGER course_members_last_owner_guard
  BEFORE UPDATE OR DELETE ON course_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_owner_removal();

-- ============================================
-- PLATFORM ADMIN (cross-course access for named individuals only)
-- ============================================

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can check own platform admin status"
  ON platform_admins FOR SELECT USING (auth.uid() = user_id);

-- Deliberately no INSERT/UPDATE/DELETE policy: with RLS enabled and zero
-- write policies, neither the anon nor authenticated Postgres role can ever
-- write to this table through the app. Admins are granted only by running
-- SQL directly (see the handover doc for the seed INSERT statements).

-- ============================================
-- BILLING (Stripe subscriptions + admin fee waivers)
-- ============================================

ALTER TABLE courses ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS plan_tier TEXT
  CHECK (plan_tier IN ('agronomist', 'superintendent', 'complete'));
ALTER TABLE courses ADD COLUMN IF NOT EXISTS subscription_status TEXT
  CHECK (subscription_status IN (
    'trialing', 'active', 'past_due', 'canceled',
    'unpaid', 'incomplete', 'incomplete_expired', 'paused'
  ));
ALTER TABLE courses ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

-- Admin fee waiver (audit trail: who waived it, when, until when)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS billing_waived_until TIMESTAMPTZ;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS billing_waived_by UUID REFERENCES auth.users(id);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS billing_waived_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS courses_stripe_customer_id_key
  ON courses(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS courses_stripe_subscription_id_key
  ON courses(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Column-privilege hardening: RLS is row-level only, so "Owners can update
-- courses" doesn't restrict WHICH columns an authorized UPDATE can touch.
-- Lock billing/Stripe columns so only service_role (admin API routes, the
-- Stripe webhook) can ever write them; authenticated keeps write access only
-- to the fields the existing course-setup UI actually edits.
REVOKE UPDATE ON courses FROM authenticated;
GRANT UPDATE (
  name, city, state, climate_zone, grass_type, num_holes,
  maintained_acres, annual_rounds, latitude, longitude, updated_at
) ON courses TO authenticated;

-- ============================================
-- PLATFORM ADMIN: view any customer's course; edit requires a
-- personal PIN-unlocked session; delete is never permitted for
-- admins, at the RLS layer, regardless of unlock state.
-- (mikeconley7@gmail.com, cabgvl@gmail.com)
-- ============================================

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid());
$$;

CREATE POLICY "Platform admins can view all profiles"
  ON profiles FOR SELECT USING (public.is_platform_admin());

CREATE POLICY "Platform admins can view courses"
  ON courses FOR SELECT USING (public.is_platform_admin());

-- Personal PIN + time-limited elevation, so admin write access is a
-- deliberate, temporary unlock rather than always-on.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS edit_pin_hash TEXT;

CREATE TABLE IF NOT EXISTS admin_edit_sessions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE admin_edit_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view own edit session"
  ON admin_edit_sessions FOR SELECT USING (auth.uid() = user_id);

-- Deliberately no INSERT/UPDATE/DELETE policy on admin_edit_sessions:
-- only the service-role-backed /api/admin/elevate route can write it,
-- after verifying the caller's PIN server-side via verify_admin_pin().

CREATE OR REPLACE FUNCTION public.is_admin_edit_elevated()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_edit_sessions
    WHERE user_id = auth.uid() AND expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.verify_admin_pin(input_pin TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions STABLE AS $$
  SELECT edit_pin_hash IS NOT NULL AND edit_pin_hash = extensions.crypt(input_pin, edit_pin_hash)
  FROM platform_admins WHERE user_id = auth.uid();
$$;

CREATE POLICY "Platform admins can update courses when edit-unlocked"
  ON courses FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- course_members: admins can always view; insert/update only while edit-unlocked; never delete
CREATE POLICY "Platform admins can view course_members"
  ON course_members FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert course_members when edit-unlocked"
  ON course_members FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update course_members when edit-unlocked"
  ON course_members FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- employees: admins can always view; insert/update only while edit-unlocked; never delete
CREATE POLICY "Platform admins can view employees"
  ON employees FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert employees when edit-unlocked"
  ON employees FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update employees when edit-unlocked"
  ON employees FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- budget_categories: admins can always view; insert/update only while edit-unlocked; never delete
CREATE POLICY "Platform admins can view budget_categories"
  ON budget_categories FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert budget_categories when edit-unlocked"
  ON budget_categories FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update budget_categories when edit-unlocked"
  ON budget_categories FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- expenses: admins can always view; insert/update only while edit-unlocked; never delete
CREATE POLICY "Platform admins can view expenses"
  ON expenses FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert expenses when edit-unlocked"
  ON expenses FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update expenses when edit-unlocked"
  ON expenses FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- fertility_programs: admins can always view; insert/update only while edit-unlocked; never delete
CREATE POLICY "Platform admins can view fertility_programs"
  ON fertility_programs FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert fertility_programs when edit-unlocked"
  ON fertility_programs FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update fertility_programs when edit-unlocked"
  ON fertility_programs FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- fertilizer_applications: admins can always view; insert/update only while edit-unlocked; never delete
CREATE POLICY "Platform admins can view fertilizer_applications"
  ON fertilizer_applications FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert fertilizer_applications when edit-unlocked"
  ON fertilizer_applications FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update fertilizer_applications when edit-unlocked"
  ON fertilizer_applications FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- soil_tests: admins can always view; insert/update only while edit-unlocked; never delete
CREATE POLICY "Platform admins can view soil_tests"
  ON soil_tests FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert soil_tests when edit-unlocked"
  ON soil_tests FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update soil_tests when edit-unlocked"
  ON soil_tests FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- gdd_daily_log: admins can always view; insert/update only while edit-unlocked; never delete
CREATE POLICY "Platform admins can view gdd_daily_log"
  ON gdd_daily_log FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert gdd_daily_log when edit-unlocked"
  ON gdd_daily_log FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update gdd_daily_log when edit-unlocked"
  ON gdd_daily_log FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- task_assignments: admins can always view; insert/update only while edit-unlocked; never delete
CREATE POLICY "Platform admins can view task_assignments"
  ON task_assignments FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert task_assignments when edit-unlocked"
  ON task_assignments FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update task_assignments when edit-unlocked"
  ON task_assignments FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- time_entries: admins can always view; insert/update only while edit-unlocked; never delete
CREATE POLICY "Platform admins can view time_entries"
  ON time_entries FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert time_entries when edit-unlocked"
  ON time_entries FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update time_entries when edit-unlocked"
  ON time_entries FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- equipment: admins can always view; insert/update only while edit-unlocked; never delete
CREATE POLICY "Platform admins can view equipment"
  ON equipment FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert equipment when edit-unlocked"
  ON equipment FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update equipment when edit-unlocked"
  ON equipment FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- maintenance_schedule_items: admins can always view; insert/update only while edit-unlocked; never delete
CREATE POLICY "Platform admins can view maintenance_schedule_items"
  ON maintenance_schedule_items FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert maintenance_schedule_items when edit-unlocked"
  ON maintenance_schedule_items FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update maintenance_schedule_items when edit-unlocked"
  ON maintenance_schedule_items FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- maintenance_log: admins can always view; insert/update only while edit-unlocked; never delete
CREATE POLICY "Platform admins can view maintenance_log"
  ON maintenance_log FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert maintenance_log when edit-unlocked"
  ON maintenance_log FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update maintenance_log when edit-unlocked"
  ON maintenance_log FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- pest_applications: admins can always view; insert/update only while edit-unlocked; never delete
CREATE POLICY "Platform admins can view pest_applications"
  ON pest_applications FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert pest_applications when edit-unlocked"
  ON pest_applications FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update pest_applications when edit-unlocked"
  ON pest_applications FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- irrigation_programs: admins can always view; insert/update only while edit-unlocked; never delete
CREATE POLICY "Platform admins can view irrigation_programs"
  ON irrigation_programs FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert irrigation_programs when edit-unlocked"
  ON irrigation_programs FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update irrigation_programs when edit-unlocked"
  ON irrigation_programs FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- irrigation_logs: admins can always view; insert/update only while edit-unlocked; never delete
CREATE POLICY "Platform admins can view irrigation_logs"
  ON irrigation_logs FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert irrigation_logs when edit-unlocked"
  ON irrigation_logs FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update irrigation_logs when edit-unlocked"
  ON irrigation_logs FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- soil_moisture_readings: admins can always view; insert/update only while edit-unlocked; never delete
CREATE POLICY "Platform admins can view soil_moisture_readings"
  ON soil_moisture_readings FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert soil_moisture_readings when edit-unlocked"
  ON soil_moisture_readings FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update soil_moisture_readings when edit-unlocked"
  ON soil_moisture_readings FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- weather_cache: admins can always view; insert/update only while edit-unlocked; never delete
CREATE POLICY "Platform admins can view weather_cache"
  ON weather_cache FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert weather_cache when edit-unlocked"
  ON weather_cache FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update weather_cache when edit-unlocked"
  ON weather_cache FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- task_templates: admins can always view; insert/update only while edit-unlocked; never delete
CREATE POLICY "Platform admins can view task_templates"
  ON task_templates FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert task_templates when edit-unlocked"
  ON task_templates FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update task_templates when edit-unlocked"
  ON task_templates FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- ============================================
-- MONTHLY RECAP REPORT (disease-risk history log + generated reports)
-- ============================================

-- Daily disease-risk snapshot, accumulated in real time as the weather
-- integration runs — same opportunistic upsert pattern as gdd_daily_log.
-- Before this table existed, disease risk was only ever computed live, so
-- there is no way to reconstruct pressure for a period before this table
-- started being written to.
CREATE TABLE IF NOT EXISTS disease_risk_daily_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  log_date DATE NOT NULL,
  dollar_spot_pct NUMERIC(5,2) NOT NULL,
  dollar_spot_above_threshold BOOLEAN NOT NULL,
  pythium_elevated BOOLEAN NOT NULL,
  brown_patch_elevated BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_id, log_date)
);

-- Generated monthly/custom-range recap reports (persisted history, not
-- just an ephemeral view) — one row per generation, auto (cron) or manual.
CREATE TABLE IF NOT EXISTS monthly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now(),
  generated_by TEXT NOT NULL CHECK (generated_by IN ('auto', 'manual')),
  generated_by_user UUID REFERENCES auth.users(id),
  data JSONB NOT NULL,
  ai_narrative TEXT
);

ALTER TABLE disease_risk_daily_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_reports ENABLE ROW LEVEL SECURITY;

-- Disease risk daily log: same pattern as gdd_daily_log
CREATE POLICY "Members can view disease risk log"
  ON disease_risk_daily_log FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners and supers can insert disease risk log"
  ON disease_risk_daily_log FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = disease_risk_daily_log.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can update disease risk log"
  ON disease_risk_daily_log FOR UPDATE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = disease_risk_daily_log.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

-- Monthly reports: members can view; owners/supers can generate (insert only — a
-- generated report is a historical record and is never edited after the fact)
CREATE POLICY "Members can view monthly reports"
  ON monthly_reports FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners and supers can insert monthly reports"
  ON monthly_reports FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = monthly_reports.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

-- Platform admins: same view-always / insert-when-edit-unlocked / never-delete
-- pattern as every other table.
CREATE POLICY "Platform admins can view disease_risk_daily_log"
  ON disease_risk_daily_log FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert disease_risk_daily_log when edit-unlocked"
  ON disease_risk_daily_log FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update disease_risk_daily_log when edit-unlocked"
  ON disease_risk_daily_log FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

CREATE POLICY "Platform admins can view monthly_reports"
  ON monthly_reports FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert monthly_reports when edit-unlocked"
  ON monthly_reports FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- ============================================
-- EQUIPMENT REPLACEMENT PLANNING
-- ============================================

-- Purchase date, used to compute fleet age and a 5-year replacement plan on
-- the Equipment page. Nullable — equipment added before this field existed
-- just shows as "not tracked" until a purchase date is filled in.
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS purchase_date DATE;

