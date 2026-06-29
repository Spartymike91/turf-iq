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

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
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
  ON course_members FOR SELECT USING (
    EXISTS (SELECT 1 FROM course_members cm WHERE cm.course_id = course_members.course_id AND cm.user_id = auth.uid())
  );
CREATE POLICY "Owners can insert members"
  ON course_members FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (
      role = 'owner' OR
      EXISTS (SELECT 1 FROM course_members cm WHERE cm.course_id = course_members.course_id AND cm.user_id = auth.uid() AND cm.role = 'owner')
    )
  );
CREATE POLICY "Owners can delete members"
  ON course_members FOR DELETE USING (
    EXISTS (SELECT 1 FROM course_members cm WHERE cm.course_id = course_members.course_id AND cm.user_id = auth.uid() AND cm.role = 'owner')
  );

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
