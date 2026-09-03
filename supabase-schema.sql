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
  n_lbs_per_1000 NUMERIC(6,3) NOT NULL DEFAULT 0,
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

-- Task assignments: same pattern as employees. Scheduling day-to-day work is
-- an assistant-level responsibility in practice (confirmed by a real customer
-- hitting this as a hard block), not just owner/superintendent — crew_lead
-- and crew still can't create/edit/delete assignments, only view and
-- start/complete their own via the service-role-backed routes.
CREATE POLICY "Members can view task assignments"
  ON task_assignments FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners and supers can insert task assignments"
  ON task_assignments FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = task_assignments.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent', 'assistant'))
  );
CREATE POLICY "Owners and supers can update task assignments"
  ON task_assignments FOR UPDATE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = task_assignments.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent', 'assistant'))
  );
CREATE POLICY "Owners and supers can delete task assignments"
  ON task_assignments FOR DELETE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = task_assignments.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent', 'assistant'))
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

-- Guards against removing/demoting a course's sole owner via the Team page —
-- but NOT against a full course deletion, which necessarily removes every
-- member including the owner. The DELETE branch's early-return checks
-- whether the `courses` row itself is already gone (i.e. this is firing as
-- part of an ON DELETE CASCADE from `courses`, not a standalone removal of
-- just this one membership row) and skips the guard in that case.
CREATE OR REPLACE FUNCTION public.prevent_last_owner_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'owner')
     OR (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role <> 'owner') THEN
    IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM courses WHERE id = OLD.course_id) THEN
      RETURN OLD;
    END IF;
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
  anthracnose_asi NUMERIC(6,2),
  anthracnose_above_threshold BOOLEAN,
  fusarium_elevated BOOLEAN,
  spring_dead_spot_soil_temp_f NUMERIC(5,1),
  spring_dead_spot_in_window BOOLEAN,
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

-- ============================================
-- ERROR MONITORING
-- ============================================

-- Captures unhandled client errors/rejections (via instrumentation-client.ts)
-- and server request errors (via instrumentation.ts onRequestError). course_id
-- and user_id are nullable because errors can happen pre-login (e.g. on
-- /login) or with no course context at all. Rows are only ever written by
-- the service-role client (in /api/errors or directly from instrumentation.ts),
-- never from a user-session client — so there is deliberately no INSERT
-- policy for anon/authenticated roles, same pattern as admin_edit_sessions.
CREATE TABLE IF NOT EXISTS error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('client', 'server')),
  message TEXT NOT NULL,
  stack TEXT,
  url TEXT,
  user_agent TEXT,
  context JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can view error_log"
  ON error_log FOR SELECT USING (public.is_platform_admin());

-- ============================================
-- SENSITIVE-DATA PIN (Budget / Labor / Payroll)
-- ============================================
-- Same shape as the platform-admin PIN elevation above: each user sets their
-- own 4-digit PIN; entering it correctly opens a 30-minute session that RLS
-- checks before allowing reads of budget/payroll data. Every course member
-- currently sees Budget/Labor once the plan tier unlocks those tabs — this
-- adds a second, per-person factor so a real customer's crew can't casually
-- see the owner's spend or each other's pay just by clicking the tab.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sensitive_pin_hash TEXT;

CREATE TABLE IF NOT EXISTS sensitive_data_sessions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE sensitive_data_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sensitive session" ON sensitive_data_sessions;
CREATE POLICY "Users can view own sensitive session"
  ON sensitive_data_sessions FOR SELECT USING (auth.uid() = user_id);

-- Deliberately no INSERT/UPDATE/DELETE policy: only the service-role-backed
-- /api/account/sensitive-pin/verify route writes it, after verifying the
-- caller's PIN server-side via verify_sensitive_pin() — same pattern as
-- admin_edit_sessions.

CREATE OR REPLACE FUNCTION public.is_sensitive_data_elevated()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM sensitive_data_sessions
    WHERE user_id = auth.uid() AND expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.verify_sensitive_pin(input_pin TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions STABLE AS $$
  SELECT sensitive_pin_hash IS NOT NULL AND sensitive_pin_hash = extensions.crypt(input_pin, sensitive_pin_hash)
  FROM profiles WHERE id = auth.uid();
$$;

-- Callable by any logged-in user to set/change their own PIN (never someone
-- else's — always scoped to auth.uid()). SECURITY DEFINER so it can hash via
-- pgcrypto without a client ever handling the hash.
CREATE OR REPLACE FUNCTION public.set_sensitive_pin(input_pin TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF input_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 4 digits.';
  END IF;
  UPDATE profiles SET sensitive_pin_hash = extensions.crypt(input_pin, extensions.gen_salt('bf'))
  WHERE id = auth.uid();
END;
$$;

-- Employee pay rate, split out of `employees` into its own table so the
-- general employee directory (needed broadly for task assignment, time
-- clock, and scheduler dropdowns) stays visible to all course members, while
-- the actual dollar rate requires the sensitive-data PIN unlock. Without this
-- split, gating the whole `employees` table would break every page that just
-- needs employee names.
CREATE TABLE IF NOT EXISTS employee_pay_rates (
  employee_id UUID PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  hourly_rate NUMERIC(6,2) NOT NULL
);

-- Guarded: safe to re-run even if a prior attempt already copied the data
-- and dropped the column (the column won't exist the second time around).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'hourly_rate'
  ) THEN
    INSERT INTO employee_pay_rates (employee_id, hourly_rate)
    SELECT id, hourly_rate FROM employees
    ON CONFLICT (employee_id) DO NOTHING;

    ALTER TABLE employees DROP COLUMN hourly_rate;
  END IF;
END $$;

ALTER TABLE employee_pay_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Elevated members can view pay rates" ON employee_pay_rates;
CREATE POLICY "Elevated members can view pay rates"
  ON employee_pay_rates FOR SELECT USING (
    public.is_sensitive_data_elevated() AND
    EXISTS (
      SELECT 1 FROM employees e
      JOIN course_members cm ON cm.course_id = e.course_id
      WHERE e.id = employee_pay_rates.employee_id AND cm.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Owners and supers can insert pay rates when elevated" ON employee_pay_rates;
CREATE POLICY "Owners and supers can insert pay rates when elevated"
  ON employee_pay_rates FOR INSERT WITH CHECK (
    public.is_sensitive_data_elevated() AND
    EXISTS (
      SELECT 1 FROM employees e
      JOIN course_members cm ON cm.course_id = e.course_id
      WHERE e.id = employee_pay_rates.employee_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'superintendent')
    )
  );
DROP POLICY IF EXISTS "Owners and supers can update pay rates when elevated" ON employee_pay_rates;
CREATE POLICY "Owners and supers can update pay rates when elevated"
  ON employee_pay_rates FOR UPDATE USING (
    public.is_sensitive_data_elevated() AND
    EXISTS (
      SELECT 1 FROM employees e
      JOIN course_members cm ON cm.course_id = e.course_id
      WHERE e.id = employee_pay_rates.employee_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'superintendent')
    )
  );
DROP POLICY IF EXISTS "Owners and supers can delete pay rates when elevated" ON employee_pay_rates;
CREATE POLICY "Owners and supers can delete pay rates when elevated"
  ON employee_pay_rates FOR DELETE USING (
    public.is_sensitive_data_elevated() AND
    EXISTS (
      SELECT 1 FROM employees e
      JOIN course_members cm ON cm.course_id = e.course_id
      WHERE e.id = employee_pay_rates.employee_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'superintendent')
    )
  );

DROP POLICY IF EXISTS "Platform admins can view employee_pay_rates" ON employee_pay_rates;
CREATE POLICY "Platform admins can view employee_pay_rates"
  ON employee_pay_rates FOR SELECT USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Platform admins can insert employee_pay_rates when edit-unlocked" ON employee_pay_rates;
CREATE POLICY "Platform admins can insert employee_pay_rates when edit-unlocked"
  ON employee_pay_rates FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
DROP POLICY IF EXISTS "Platform admins can update employee_pay_rates when edit-unlocked" ON employee_pay_rates;
CREATE POLICY "Platform admins can update employee_pay_rates when edit-unlocked"
  ON employee_pay_rates FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

-- Budget/labor data: viewing now also requires the sensitive-data PIN
-- unlock, on top of ordinary course membership. Write permissions
-- (owner/superintendent only) are unchanged — this feature is about who can
-- *see* the numbers, not who can edit them.
ALTER POLICY "Members can view expenses" ON expenses
  USING (public.is_course_member(course_id) AND public.is_sensitive_data_elevated());
ALTER POLICY "Members can view budget categories" ON budget_categories
  USING (public.is_course_member(course_id) AND public.is_sensitive_data_elevated());
ALTER POLICY "Members can view monthly reports" ON monthly_reports
  USING (public.is_course_member(course_id) AND public.is_sensitive_data_elevated());

-- ============================================
-- PER-CREW TAB PERMISSIONS
-- ============================================
-- NULL means unrestricted (sees every module the plan tier allows) — the
-- default for every existing row, so this is fully backward compatible.
-- A non-null array restricts nav visibility to just those module slugs
-- (enforced in the app, not RLS — this governs what shows in the nav and
-- whether a direct page visit is blocked, not row-level data access; Budget
-- and Labor already have their own real RLS gate via the sensitive-data PIN
-- above regardless of this). Owner/superintendent are always treated as
-- unrestricted in the app regardless of what's stored here, as a safety net.
-- Covered by the existing course_members_update_v1 / _insert_v2 policies —
-- no new RLS policy needed, this is just a new column on an already-policied
-- table.
ALTER TABLE course_members ADD COLUMN IF NOT EXISTS allowed_modules TEXT[];

-- ============================================
-- TASK COST LINKAGE
-- ============================================
-- Foundations for tying real labor/materials cost to Budget automatically
-- when a scheduled task is marked complete, and for comparing employees'
-- actual time against a per-course target.
--
-- target_minutes is a structured, per-course-editable standard time for a
-- task (distinct from the existing free-text estimated_duration, which stays
-- as-is for display). quality_rating is an optional 1-5 self/super rating
-- captured at completion, for future "which employee is fastest/best for
-- this task" comparisons — captured now so the data starts accumulating
-- immediately, even though nothing reads it yet.
ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS target_minutes INTEGER;
ALTER TABLE task_assignments ADD COLUMN IF NOT EXISTS quality_rating SMALLINT CHECK (quality_rating BETWEEN 1 AND 5);

-- Nullable link back to the task that generated this expense (manual expense
-- entries have no assignment, so this stays null for those), plus a source
-- tag so the Expense Log can show *why* a row exists instead of it looking
-- like a mystery charge. Both written only by /api/tasks/complete, using the
-- service-role client — see that route for why (the caller who completes a
-- task may not have their own Budget PIN elevated, and this is a system
-- computation, not the caller viewing someone else's data).
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS task_assignment_id UUID REFERENCES task_assignments(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'task_labor', 'task_materials'));

-- ============================================
-- EMPLOYEE SELF-SERVICE TASK START/COMPLETE
-- ============================================
-- `employees` is a roster (name, pay rate) used for kiosk time-clock and
-- task assignment — it deliberately has no guaranteed link to a real login
-- (course_members), since a physical crew member may not have one. This
-- column is that link, set optionally by an owner/superintendent on the
-- Labor page: "this employee IS this logged-in team member." Once linked,
-- that person can start/complete tasks assigned to them from their own
-- login via /api/tasks/start and /api/tasks/complete — those routes check
-- this link server-side (using the service-role client) rather than
-- broadening the task_assignments UPDATE RLS policy itself, since RLS is
-- row-level and can't cleanly restrict a crew member to touching only
-- status/started_at/completed_at on their own row without also letting them
-- rewrite the task's name, priority, or reassign it to someone else.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS course_member_id UUID REFERENCES course_members(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employees_course_member_id_unique ON employees(course_member_id) WHERE course_member_id IS NOT NULL;

-- ============================================
-- RAINFALL TRACKING (actual vs. historical average, year-to-date)
-- ============================================

-- Daily actual rainfall, accumulated in real time as the weather integration
-- runs — same opportunistic upsert pattern as gdd_daily_log, except today's
-- row is overwritten (not ignoreDuplicates) as more hourly observations come
-- in through the day. Like gdd_daily_log, there's no way to reconstruct rain
-- for a period before this table started being written to.
CREATE TABLE IF NOT EXISTS rainfall_daily_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  log_date DATE NOT NULL,
  rainfall_in NUMERIC(6,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_id, log_date)
);

-- Historical daily-average rainfall by calendar day (Jan 1 = '01-01', etc.),
-- computed once per course from a 10-year lookback via Open-Meteo's archive
-- API, then cached indefinitely — climate normals don't change day to day, so
-- there's no reason to recompute them on every page load. Stores a running
-- cumulative-from-Jan-1 average so "average rainfall so far this year" is a
-- single indexed lookup.
CREATE TABLE IF NOT EXISTS course_rainfall_normals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  month_day TEXT NOT NULL,
  cumulative_avg_in NUMERIC(7,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_id, month_day)
);

ALTER TABLE rainfall_daily_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_rainfall_normals ENABLE ROW LEVEL SECURITY;

-- Rainfall daily log: same pattern as gdd_daily_log
CREATE POLICY "Members can view rainfall log"
  ON rainfall_daily_log FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners and supers can insert rainfall log"
  ON rainfall_daily_log FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = rainfall_daily_log.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can update rainfall log"
  ON rainfall_daily_log FOR UPDATE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = rainfall_daily_log.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

-- Rainfall normals: same pattern, members can view once computed
CREATE POLICY "Members can view rainfall normals"
  ON course_rainfall_normals FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners and supers can insert rainfall normals"
  ON course_rainfall_normals FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = course_rainfall_normals.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

CREATE POLICY "Platform admins can view rainfall_daily_log"
  ON rainfall_daily_log FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert rainfall_daily_log when edit-unlocked"
  ON rainfall_daily_log FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update rainfall_daily_log when edit-unlocked"
  ON rainfall_daily_log FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());

CREATE POLICY "Platform admins can view course_rainfall_normals"
  ON course_rainfall_normals FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert course_rainfall_normals when edit-unlocked"
  ON course_rainfall_normals FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());



-- ============================================
-- CUSTOM MEMBER TITLES
-- ============================================
-- course_members.role stays the fixed permission tier (owner/super/
-- assistant/crew_lead/crew) that actually governs access — this is a
-- purely cosmetic free-text label a superintendent can set per person
-- (e.g. "Equipment Manager", "Head Mechanic") shown in place of the
-- generic role name in the Team roster. Scoping what an "Equipment
-- Manager" can actually touch is still done via the existing
-- allowed_modules checklist on their real role, not a new permission tier.
ALTER TABLE course_members ADD COLUMN IF NOT EXISTS title TEXT;


-- ============================================
-- PRODUCT DIRECTORY + INVENTORY TRACKING
-- ============================================
-- Catalog of chemicals/fertilizers the course uses, with a simple current-
-- stock quantity. Phase 1 of two: this just tracks what exists and how much
-- is on hand (manually adjusted via 'Receive Stock' or direct edits). A
-- later phase wires fertilizer_applications/pest_applications to reference
-- these products directly (unified dropdowns, multi-product logging) and
-- auto-decrement stock on use — deliberately not built yet since it doesn't
-- exist until that phase needs it.
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('fertilizer', 'fungicide', 'herbicide', 'insecticide', 'growth_regulator', 'other')),
  unit TEXT NOT NULL,
  unit_cost NUMERIC(10,2),
  current_stock NUMERIC(10,2) NOT NULL DEFAULT 0,
  reorder_threshold NUMERIC(10,2),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Same pattern as equipment: members view, owner/super manage.
CREATE POLICY "Members can view products"
  ON products FOR SELECT USING (public.is_course_member(course_id));
CREATE POLICY "Owners and supers can insert products"
  ON products FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = products.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can update products"
  ON products FOR UPDATE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = products.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
CREATE POLICY "Owners and supers can delete products"
  ON products FOR DELETE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = products.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

CREATE POLICY "Platform admins can view products"
  ON products FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Platform admins can insert products when edit-unlocked"
  ON products FOR INSERT WITH CHECK (public.is_platform_admin() AND public.is_admin_edit_elevated());
CREATE POLICY "Platform admins can update products when edit-unlocked"
  ON products FOR UPDATE USING (public.is_platform_admin() AND public.is_admin_edit_elevated());


-- ============================================
-- MULTI-PRODUCT APPLICATION LOGGING
-- ============================================
-- Phase 2 of the product inventory work: link applications to the product
-- directory (optional — free-text product name still works for anything not
-- in the directory yet) and let one Log Application submission cover several
-- products at once, sharing the same zone/area/date/target. product TEXT
-- stays as a denormalized snapshot so historical rows keep displaying
-- correctly even if a linked product is later renamed or removed.
-- quantity_used (in the product's own inventory unit) is optional and, when
-- set on a directory-linked line, decrements that product's current_stock.
ALTER TABLE fertilizer_applications ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE fertilizer_applications ADD COLUMN IF NOT EXISTS quantity_used NUMERIC(10,2);

ALTER TABLE pest_applications ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE pest_applications ADD COLUMN IF NOT EXISTS quantity_used NUMERIC(10,2);
ALTER TABLE pest_applications ADD COLUMN IF NOT EXISTS area TEXT;


-- ============================================
-- APPLICATION COSTS -> BUDGET
-- ============================================
-- pest_applications never had a cost column at all (fertilizer_applications
-- already did). Both now compute cost automatically when a directory-linked
-- product with a unit_cost is used (unit_cost * quantity_used), editable by
-- the user afterward. When an application has a cost, the page that logged
-- it also records a matching expense so it shows up in Budget vs Actual —
-- fertilizer_applications under a 'Fertilizer' category, pest_applications
-- under 'Chemicals' (shared by Pest & Weed and Disease Risk, which both
-- write to that same table).
--
-- ON DELETE CASCADE here (not SET NULL, unlike task_assignment_id on this
-- same table) is deliberate: deleting a task is rare, but deleting/correcting
-- an application log entry is routine, and an orphaned expense nobody can
-- trace back to anything would silently corrupt the budget totals.
ALTER TABLE pest_applications ADD COLUMN IF NOT EXISTS cost NUMERIC(10,2);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS fertilizer_application_id UUID REFERENCES fertilizer_applications(id) ON DELETE CASCADE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS pest_application_id UUID REFERENCES pest_applications(id) ON DELETE CASCADE;

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_source_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_source_check
  CHECK (source IN ('manual', 'task_labor', 'task_materials', 'application_fertilizer', 'application_pest'));

-- ============================================
-- MOW DIRECTION + TASK ORDER NUMBERING
-- ============================================
-- Crew asked for mow direction using the clock-hour convention turf crews
-- already use (12-6 straight, 2-8 left-to-right, 3-9 across, 4-10
-- right-to-left) plus a crosscut pattern. It's a per-task field, not a
-- course-wide setting, since different mow jobs on the same day can call
-- for different directions. task_templates.category is free text (no
-- enum), so this can't be gated to "mowing" tasks specifically — it's just
-- optional on every task assignment, left blank when irrelevant.
--
-- priority also changes from a low/normal/high severity enum to a plain
-- ordinal (Task 1, Task 2, Task 3...) so crew cards can list a person's
-- jobs in the order they should do them, matching how the reference
-- crew-board design numbers each employee's task list. Existing high/
-- normal/low rows map to 1/2/3 so "high" (do first) becomes "Task 1".
ALTER TABLE task_assignments ADD COLUMN IF NOT EXISTS mow_direction TEXT
  CHECK (mow_direction IN ('straight', 'diagonal_lr', 'across', 'diagonal_rl', 'crosscut'));

ALTER TABLE task_assignments DROP CONSTRAINT IF EXISTS task_assignments_priority_check;
ALTER TABLE task_assignments ALTER COLUMN priority DROP DEFAULT;
ALTER TABLE task_assignments ALTER COLUMN priority TYPE INTEGER USING (
  CASE priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 1 END
);
ALTER TABLE task_assignments ALTER COLUMN priority SET DEFAULT 1;
ALTER TABLE task_assignments ADD CONSTRAINT task_assignments_priority_check CHECK (priority >= 1);

-- ============================================
-- MERGE FERTILITY / PEST & WEED / DISEASE RISK -> TURF HEALTH
-- ============================================
-- The three separate nav tabs became one "Turf Health" tab with internal
-- sub-tabs (src/app/(app)/turf-health/page.tsx) — same three pages'
-- worth of functionality, just one nav entry and one module-permission
-- slug instead of three. course_members.allowed_modules stores per-crew
-- permission slugs pulled from src/lib/planAccess.ts's ALL_MODULES list,
-- so a crew member previously granted any of the three old slugs needs
-- them replaced with the new one, or they'd silently lose access.
UPDATE course_members
SET allowed_modules = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      array_replace(array_replace(array_replace(allowed_modules, 'disease', 'turf-health'), 'fertility', 'turf-health'), 'pest-weed', 'turf-health')
    )
  )
)
WHERE allowed_modules && ARRAY['disease', 'fertility', 'pest-weed'];

-- ============================================
-- FIX: budget_categories/expenses writes incorrectly PIN-gated
-- ============================================
-- The Budget/Labor sensitive-data PIN feature (~line 1249) was meant to
-- gate only *viewing* budget_categories/expenses, via `ALTER POLICY
-- "Members can view ..."` — the comment there explicitly says "Write
-- permissions (owner/superintendent only) are unchanged." But the live
-- INSERT/UPDATE/DELETE policies on these two tables ended up requiring
-- is_sensitive_data_elevated() too, diverging from both this file's text
-- and the stated intent (confirmed by direct testing: an owner who has
-- never unlocked the PIN gets a 42501 RLS error on insert; unlocking it
-- immediately fixes it, with no other change).
--
-- This silently broke every client-side "log an application -> auto-post
-- an expense" flow (Fertility/Weed/Insects/Disease Risk) for any owner/
-- superintendent who hadn't separately opened Budget and entered their
-- PIN first — the application itself still saved fine, only the
-- best-effort budget-posting follow-up failed. It was misdiagnosed
-- earlier in this project's history as "transient RLS, resolves on
-- retry" because retrying only ever appeared to work when a Budget-page
-- visit (which requires the PIN) happened in between.
--
-- This re-asserts the original, documented, PIN-independent write
-- policies. Safe to re-run.
DROP POLICY IF EXISTS "Owners and supers can insert budget categories" ON budget_categories;
CREATE POLICY "Owners and supers can insert budget categories"
  ON budget_categories FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = budget_categories.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
DROP POLICY IF EXISTS "Owners and supers can update budget categories" ON budget_categories;
CREATE POLICY "Owners and supers can update budget categories"
  ON budget_categories FOR UPDATE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = budget_categories.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
DROP POLICY IF EXISTS "Owners and supers can delete budget categories" ON budget_categories;
CREATE POLICY "Owners and supers can delete budget categories"
  ON budget_categories FOR DELETE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = budget_categories.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

DROP POLICY IF EXISTS "Owners and supers can insert expenses" ON expenses;
CREATE POLICY "Owners and supers can insert expenses"
  ON expenses FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = expenses.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
DROP POLICY IF EXISTS "Owners and supers can update expenses" ON expenses;
CREATE POLICY "Owners and supers can update expenses"
  ON expenses FOR UPDATE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = expenses.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );
DROP POLICY IF EXISTS "Owners and supers can delete expenses" ON expenses;
CREATE POLICY "Owners and supers can delete expenses"
  ON expenses FOR DELETE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = expenses.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent'))
  );

-- ============================================
-- FOLLOW-UP: the raw-subquery rewrite above didn't fix it either
-- ============================================
-- Confirmed via pg_policies that the rewritten policy text above is
-- exactly correct (byte-for-byte the intended condition, no PIN check,
-- no hidden restrictive policy anywhere on either table) — yet a
-- brand-new owner with zero PIN history still gets the RLS error on
-- every attempt, no caching delay, while the *identical* EXISTS-against-
-- course_members predicate keeps working fine on task_assignments and
-- products. Since is_course_member()/is_course_owner() above are
-- deliberately SECURITY DEFINER specifically to let cross-table RLS
-- checks against course_members avoid recursion/visibility edge cases
-- (see the comment above their definitions), moving budget_categories'
-- and expenses' write checks onto the same proven helper-function
-- pattern — instead of a raw inline subquery — sidesteps whatever this
-- is rather than continuing to guess at it blind.
CREATE OR REPLACE FUNCTION public.can_manage_course_finances(target_course_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM course_members
    WHERE course_id = target_course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent')
  );
$$;

DROP POLICY IF EXISTS "Owners and supers can insert budget categories" ON budget_categories;
CREATE POLICY "Owners and supers can insert budget categories"
  ON budget_categories FOR INSERT WITH CHECK (public.can_manage_course_finances(course_id));
DROP POLICY IF EXISTS "Owners and supers can update budget categories" ON budget_categories;
CREATE POLICY "Owners and supers can update budget categories"
  ON budget_categories FOR UPDATE USING (public.can_manage_course_finances(course_id));
DROP POLICY IF EXISTS "Owners and supers can delete budget categories" ON budget_categories;
CREATE POLICY "Owners and supers can delete budget categories"
  ON budget_categories FOR DELETE USING (public.can_manage_course_finances(course_id));

DROP POLICY IF EXISTS "Owners and supers can insert expenses" ON expenses;
CREATE POLICY "Owners and supers can insert expenses"
  ON expenses FOR INSERT WITH CHECK (public.can_manage_course_finances(course_id));
DROP POLICY IF EXISTS "Owners and supers can update expenses" ON expenses;
CREATE POLICY "Owners and supers can update expenses"
  ON expenses FOR UPDATE USING (public.can_manage_course_finances(course_id));
DROP POLICY IF EXISTS "Owners and supers can delete expenses" ON expenses;
CREATE POLICY "Owners and supers can delete expenses"
  ON expenses FOR DELETE USING (public.can_manage_course_finances(course_id));

-- ============================================
-- MIGRATION: Anthracnose disease risk model
-- ============================================
-- Adds the 4th disease model (Danneberger/Vargas/Jones 1984 Anthracnose
-- Severity Index) alongside Dollar Spot/Pythium/Brown Patch. Nullable
-- since existing disease_risk_daily_log rows have no historical
-- Anthracnose data to backfill.
ALTER TABLE disease_risk_daily_log ADD COLUMN IF NOT EXISTS anthracnose_asi NUMERIC(6,2);
ALTER TABLE disease_risk_daily_log ADD COLUMN IF NOT EXISTS anthracnose_above_threshold BOOLEAN;

-- ============================================
-- MIGRATION: Fusarium Patch + Spring Dead Spot
-- ============================================
-- Fusarium Patch: qualitative heuristic (no published numeric regression
-- exists), same tier as Brown Patch. Spring Dead Spot: risk-factor tracking
-- (fall soil-temp window), not an acute spray-trigger model — see weather.ts
-- for why it doesn't get a +24/48/72h forecast like the other five. Nullable
-- since existing rows have no historical data for either.
ALTER TABLE disease_risk_daily_log ADD COLUMN IF NOT EXISTS fusarium_elevated BOOLEAN;
ALTER TABLE disease_risk_daily_log ADD COLUMN IF NOT EXISTS spring_dead_spot_soil_temp_f NUMERIC(5,1);
ALTER TABLE disease_risk_daily_log ADD COLUMN IF NOT EXISTS spring_dead_spot_in_window BOOLEAN;

-- ============================================
-- MIGRATION: Equipment Manager role
-- ============================================
-- New permission-level role alongside owner/superintendent/assistant/
-- crew_lead/crew. Unlike every other junior role, this one gets real RLS
-- write access (equipment + maintenance tables only) rather than just the
-- allowed_modules visibility layer — see src/lib/roles.ts for the full
-- rationale. Budget, fertility, irrigation, tasks, payroll, products, etc.
-- are deliberately left untouched; scope stays to the equipment domain.
ALTER TABLE course_members DROP CONSTRAINT IF EXISTS course_members_role_check;
ALTER TABLE course_members ADD CONSTRAINT course_members_role_check
  CHECK (role IN ('owner', 'superintendent', 'assistant', 'crew_lead', 'equipment_manager', 'crew'));

-- Let a superintendent assign the new role, same as assistant/crew_lead/crew today.
DROP POLICY IF EXISTS "course_members_insert_v2" ON course_members;
CREATE POLICY "course_members_insert_v2" ON course_members FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND (
    role = 'owner'
    OR public.is_course_owner(course_id)
    OR (public.is_course_superintendent(course_id) AND role IN ('assistant', 'crew_lead', 'equipment_manager', 'crew'))
  )
);

DROP POLICY IF EXISTS "course_members_update_v1" ON course_members;
CREATE POLICY "course_members_update_v1" ON course_members FOR UPDATE
  USING (
    public.is_course_owner(course_id)
    OR (public.is_course_superintendent(course_id) AND role IN ('assistant', 'crew_lead', 'equipment_manager', 'crew'))
  )
  WITH CHECK (
    public.is_course_owner(course_id)
    OR (public.is_course_superintendent(course_id) AND role IN ('assistant', 'crew_lead', 'equipment_manager', 'crew'))
  );

-- Real write access to the equipment domain — the part that makes this role
-- functionally meaningful, not just a label.
DROP POLICY IF EXISTS "Owners and supers can insert equipment" ON equipment;
CREATE POLICY "Owners and supers can insert equipment"
  ON equipment FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = equipment.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent', 'equipment_manager'))
  );
DROP POLICY IF EXISTS "Owners and supers can update equipment" ON equipment;
CREATE POLICY "Owners and supers can update equipment"
  ON equipment FOR UPDATE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = equipment.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent', 'equipment_manager'))
  );
DROP POLICY IF EXISTS "Owners and supers can delete equipment" ON equipment;
CREATE POLICY "Owners and supers can delete equipment"
  ON equipment FOR DELETE USING (
    EXISTS (SELECT 1 FROM course_members WHERE course_id = equipment.course_id AND user_id = auth.uid() AND role IN ('owner', 'superintendent', 'equipment_manager'))
  );

DROP POLICY IF EXISTS "Owners and supers can insert maintenance schedule items" ON maintenance_schedule_items;
CREATE POLICY "Owners and supers can insert maintenance schedule items"
  ON maintenance_schedule_items FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM equipment e JOIN course_members cm ON cm.course_id = e.course_id WHERE e.id = maintenance_schedule_items.equipment_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'superintendent', 'equipment_manager'))
  );
DROP POLICY IF EXISTS "Owners and supers can update maintenance schedule items" ON maintenance_schedule_items;
CREATE POLICY "Owners and supers can update maintenance schedule items"
  ON maintenance_schedule_items FOR UPDATE USING (
    EXISTS (SELECT 1 FROM equipment e JOIN course_members cm ON cm.course_id = e.course_id WHERE e.id = maintenance_schedule_items.equipment_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'superintendent', 'equipment_manager'))
  );
DROP POLICY IF EXISTS "Owners and supers can delete maintenance schedule items" ON maintenance_schedule_items;
CREATE POLICY "Owners and supers can delete maintenance schedule items"
  ON maintenance_schedule_items FOR DELETE USING (
    EXISTS (SELECT 1 FROM equipment e JOIN course_members cm ON cm.course_id = e.course_id WHERE e.id = maintenance_schedule_items.equipment_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'superintendent', 'equipment_manager'))
  );

DROP POLICY IF EXISTS "Owners and supers can insert maintenance log" ON maintenance_log;
CREATE POLICY "Owners and supers can insert maintenance log"
  ON maintenance_log FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM equipment e JOIN course_members cm ON cm.course_id = e.course_id WHERE e.id = maintenance_log.equipment_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'superintendent', 'equipment_manager'))
  );
DROP POLICY IF EXISTS "Owners and supers can delete maintenance log" ON maintenance_log;
CREATE POLICY "Owners and supers can delete maintenance log"
  ON maintenance_log FOR DELETE USING (
    EXISTS (SELECT 1 FROM equipment e JOIN course_members cm ON cm.course_id = e.course_id WHERE e.id = maintenance_log.equipment_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'superintendent', 'equipment_manager'))
  );

-- ============================================
-- MIGRATION: Growth Regulator application tab
-- ============================================
-- New pest_applications sub-category (Growth Regulator) carved out of the
-- Insects catch-all, same pattern as the earlier Weed/Disease splits — see
-- src/lib/pestCategorization.ts. Only the products.category CHECK
-- constraint needs a DB change; pest_applications/budget_categories are
-- plain TEXT with no constraint to widen.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_category_check;
ALTER TABLE products ADD CONSTRAINT products_category_check
  CHECK (category IN ('fertilizer', 'fungicide', 'herbicide', 'insecticide', 'growth_regulator', 'other'));

-- ============================================
-- MIGRATION: Unified "Log Application" entry point
-- ============================================
-- Lets a single tank-mix submission (fertilizer + pest/weed/disease/PGR
-- products together) store each line's category explicitly rather than
-- re-guessing it later from target-keyword matching. Existing rows keep
-- working via the existing keyword-fallback classifiers in
-- src/lib/pestCategorization.ts (category IS NULL there). target moving to
-- nullable supports lines with no natural "target" (e.g. a fertilizer or
-- growth-regulator line in a mixed tank).
--
-- NOTE: a planned products.n_pct (%N) field for auto-calculating a
-- fertilizer line's N-rate was dropped during implementation — %N x
-- quantity used only yields a valid lbs-per-1000-sqft rate if the treated
-- area's square footage is also known, and that isn't tracked anywhere
-- (Area is a location name like "Greens", not a number). N-rate stays
-- manual entry, exactly as it already works today. Revisit only if course
-- areas ever get a tracked square footage.
ALTER TABLE pest_applications ALTER COLUMN target DROP NOT NULL;
ALTER TABLE pest_applications ADD COLUMN IF NOT EXISTS category TEXT;

-- ============================================
-- MIGRATION: Fix missing UPDATE policies for the new per-row Edit feature
-- ============================================
-- Neither pest_applications nor fertilizer_applications ever had a
-- course-member UPDATE policy (only SELECT/INSERT/DELETE existed for
-- owners/superintendents — UPDATE only existed for platform admins).
-- Editing a logged application therefore silently affected 0 rows under
-- RLS: Postgrest reports no error when an .update()/.delete() matches 0
-- RLS-visible rows, it just returns an empty result, so this went
-- unnoticed until live-tested. Confirmed live via can_manage_course_finances()
-- RPC call, which correctly returns true for a plain test owner — so that
-- helper is trustworthy; reusing it here rather than a fresh raw subquery.
--
-- Also reasserting expenses' UPDATE/DELETE policies through the same
-- helper: testing the edit-and-reconcile-expense flow reproduced the exact
-- "brand-new owner still gets 0 rows" symptom this project already hit
-- once and thought it fixed further up in this file — that fix evidently
-- never made it to the live database. Safe to re-run.
DROP POLICY IF EXISTS "Owners and supers can update pest_applications" ON pest_applications;
CREATE POLICY "Owners and supers can update pest_applications"
  ON pest_applications FOR UPDATE USING (public.can_manage_course_finances(course_id));

DROP POLICY IF EXISTS "Owners and supers can update fertilizer_applications" ON fertilizer_applications;
CREATE POLICY "Owners and supers can update fertilizer_applications"
  ON fertilizer_applications FOR UPDATE USING (public.can_manage_course_finances(course_id));

DROP POLICY IF EXISTS "Owners and supers can update expenses" ON expenses;
CREATE POLICY "Owners and supers can update expenses"
  ON expenses FOR UPDATE USING (public.can_manage_course_finances(course_id));
DROP POLICY IF EXISTS "Owners and supers can delete expenses" ON expenses;
CREATE POLICY "Owners and supers can delete expenses"
  ON expenses FOR DELETE USING (public.can_manage_course_finances(course_id));
