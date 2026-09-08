"use client";

import { Suspense } from "react";
import CourseForm from "@/components/course/CourseForm";

export default function NewCoursePage() {
  return (
    <Suspense fallback={null}>
      <CourseForm forceCreate />
    </Suspense>
  );
}
