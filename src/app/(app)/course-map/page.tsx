"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { resolveCourseIdClient } from "@/lib/supabase/course-context";
import { NOTE_CATEGORIES, categoryColor, categoryLabel, type CourseMapNote } from "@/components/courseMap/CourseMapView";

// Leaflet touches `window` on import, so it can never run during SSR — see
// the identical note in weather/page.tsx, the first place this app hit it.
const CourseMapView = dynamic(() => import("@/components/courseMap/CourseMapView"), {
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center text-mist text-sm">Loading map…</div>,
});

interface NoteRow extends CourseMapNote {
  created_by: string | null;
  created_at: string;
}

interface MemberRef {
  id: string;
  full_name: string | null;
}

type Popup =
  | { mode: "add"; lat: number; lng: number; x: number; y: number }
  | { mode: "view"; noteId: string; x: number; y: number };

export default function CourseMapPage() {
  // Temporary, opt-in (?debug=1) on-screen event log passed down to
  // CourseMapView — see the note on its `debug` prop for why this exists.
  const debug = useSearchParams().get("debug") === "1";
  const [checking, setChecking] = useState(true);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRef[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);

  const [courseAddress, setCourseAddress] = useState<string | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [addressInput, setAddressInput] = useState("");
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  const [popup, setPopup] = useState<Popup | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteCategory, setNoteCategory] = useState("general");
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const isManager = myRole === "owner" || myRole === "superintendent";

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const context = await resolveCourseIdClient(supabase);
      if (!context || !user) {
        setChecking(false);
        return;
      }
      setCourseId(context.courseId);

      const [{ data: course }, { data: membership }, { data: memberRows }, { data: noteRows }] = await Promise.all([
        supabase.from("courses").select("address, latitude, longitude").eq("id", context.courseId).single(),
        supabase.from("course_members").select("id, role").eq("user_id", user.id).eq("course_id", context.courseId).maybeSingle(),
        supabase.from("course_members").select("id, full_name").eq("course_id", context.courseId),
        supabase
          .from("course_map_notes")
          .select("id, lat, lng, category, note, created_by, created_at")
          .eq("course_id", context.courseId)
          .order("created_at", { ascending: false }),
      ]);

      setMyRole(membership?.role ?? null);
      setMyMemberId(membership?.id ?? null);
      setMembers(memberRows ?? []);
      setNotes((noteRows ?? []) as NoteRow[]);
      if (course?.address && course.latitude != null && course.longitude != null) {
        setCourseAddress(course.address);
        setCenter({ lat: course.latitude, lng: course.longitude });
      }
      setChecking(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!popup) return;
    function handleClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setPopup(null);
        setEditingNoteId(null);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPopup(null);
        setEditingNoteId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [popup]);

  function authorFor(memberId: string | null): string {
    if (!memberId) return "Team member";
    return members.find((m) => m.id === memberId)?.full_name ?? "Team member";
  }

  async function handleSaveAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!addressInput.trim()) return;
    setAddressSaving(true);
    setAddressError(null);
    try {
      const res = await fetch("/api/course-map/set-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addressInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddressError(data.error ?? "Couldn't save address.");
        return;
      }
      setCourseAddress(data.course.address);
      setCenter({ lat: data.course.latitude, lng: data.course.longitude });
    } finally {
      setAddressSaving(false);
    }
  }

  function handleMapClick(lat: number, lng: number, x: number, y: number) {
    setPopup({ mode: "add", lat, lng, x, y });
    setEditingNoteId(null);
    setNoteCategory("general");
    setNoteText("");
    setNoteError(null);
  }

  function handleMarkerClick(noteId: string, x: number, y: number) {
    setPopup({ mode: "view", noteId, x, y });
    setEditingNoteId(null);
    setNoteError(null);
  }

  function startEditNote(note: NoteRow) {
    setEditingNoteId(note.id);
    setNoteCategory(note.category);
    setNoteText(note.note);
    setNoteError(null);
  }

  async function handleSaveNote() {
    if (!courseId || popup?.mode !== "add" || !noteText.trim()) return;
    setNoteSaving(true);
    setNoteError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("course_map_notes")
      .insert({
        course_id: courseId,
        lat: popup.lat,
        lng: popup.lng,
        category: noteCategory,
        note: noteText.trim(),
        created_by: myMemberId,
      })
      .select()
      .single();
    setNoteSaving(false);
    if (error || !data) {
      setNoteError(error?.message ?? "Couldn't save note.");
      return;
    }
    setNotes((prev) => [data as NoteRow, ...prev]);
    setPopup(null);
  }

  async function handleUpdateNote() {
    if (!editingNoteId || !noteText.trim()) return;
    setNoteSaving(true);
    setNoteError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("course_map_notes")
      .update({ category: noteCategory, note: noteText.trim(), updated_at: new Date().toISOString() })
      .eq("id", editingNoteId)
      .select()
      .single();
    setNoteSaving(false);
    if (error || !data) {
      setNoteError(error?.message ?? "Couldn't update note.");
      return;
    }
    setNotes((prev) => prev.map((n) => (n.id === editingNoteId ? (data as NoteRow) : n)));
    setPopup(null);
    setEditingNoteId(null);
  }

  async function handleDeleteNote(noteId: string) {
    const supabase = createClient();
    const { error } = await supabase.from("course_map_notes").delete().eq("id", noteId);
    if (error) {
      setNoteError(error.message);
      return;
    }
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    setPopup(null);
    setEditingNoteId(null);
  }

  if (checking) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-mist">Loading...</div>
      </div>
    );
  }

  if (!courseId) {
    return (
      <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 text-center">
        <div className="font-serif text-xl text-green-dark mb-2">No course found</div>
        <div className="text-sm text-mist">Set up your course profile first.</div>
      </div>
    );
  }

  if (!courseAddress || !center) {
    if (!isManager) {
      return (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 text-center">
          <div className="font-serif text-xl text-green-dark mb-2">Course Map coming soon</div>
          <div className="text-sm text-mist">An owner or superintendent needs to set up the course address first.</div>
        </div>
      );
    }
    return (
      <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 max-w-md mx-auto">
        <div className="font-serif text-xl text-green-dark mb-2">Set up the Course Map</div>
        <div className="text-sm text-mist mb-4">
          Enter the course&apos;s street address so we can center the satellite map on it.
        </div>
        <form onSubmit={handleSaveAddress} className="flex flex-col gap-3">
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="123 Fairway Dr, Greenville, SC"
            className="text-sm border-[1.5px] border-rule rounded-lg p-2.5"
          />
          {addressError && <div className="text-xs text-red">{addressError}</div>}
          <button
            type="submit"
            disabled={addressSaving || !addressInput.trim()}
            className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
          >
            {addressSaving ? "Locating..." : "Save address"}
          </button>
        </form>
      </div>
    );
  }

  const viewedNote = popup?.mode === "view" ? notes.find((n) => n.id === popup.noteId) : null;
  // The add/edit form (category pills + textarea + buttons) runs up to
  // ~320px tall — clicking anywhere in the lower half of the map (a large,
  // wide element) could otherwise position the popup's bottom well past
  // the visible viewport with nothing to scroll it into view, since
  // position:fixed doesn't participate in page scroll. Same idea as the
  // horizontal clamp below, just for the vertical axis.
  const POPUP_MAX_HEIGHT = 320;
  const popupLeft = popup ? Math.min(popup.x, (typeof window !== "undefined" ? window.innerWidth - 280 : popup.x)) : 0;
  const popupTop = popup
    ? Math.max(8, Math.min(popup.y, typeof window !== "undefined" ? window.innerHeight - POPUP_MAX_HEIGHT : popup.y))
    : 0;

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">Course Map</div>
          <div className="font-serif text-2xl text-green-dark">{courseAddress}</div>
          <div className="text-[13px] text-mist mt-1">
            {isManager ? "Click anywhere on the map to drop a note." : "Click a pin to read its note."}
          </div>
        </div>
      </div>

      <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden h-[520px] mb-4">
        <CourseMapView
          center={center}
          notes={notes}
          canAdd={isManager}
          onMapClick={handleMapClick}
          onMarkerClick={handleMarkerClick}
          debug={debug}
        />
      </div>

      {notes.length > 0 && (
        <div className="bg-white border-[1.5px] border-rule rounded-[10px] overflow-hidden">
          <div className="px-5 pt-3 pb-1 text-[10px] font-mono uppercase tracking-widest text-mist">
            All Notes{isManager ? " — click Edit or Delete to manage" : ""}
          </div>
          <div className="divide-y divide-rule">
            {notes.map((n) => (
              <div key={n.id} className="flex items-start gap-3 px-5 py-2.5 text-xs">
                <span className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ backgroundColor: categoryColor(n.category) }} />
                <div className="flex-1">
                  <div className="text-ink font-medium">{n.note}</div>
                  <div className="text-mist mt-0.5">
                    {categoryLabel(n.category)} · {authorFor(n.created_by)} ·{" "}
                    {new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>
                {isManager && (
                  <span className="flex items-center gap-3 shrink-0">
                    <button onClick={() => startEditNote(n)} className="text-mist font-semibold hover:text-ink">
                      Edit
                    </button>
                    <button onClick={() => handleDeleteNote(n.id)} className="text-mist font-semibold hover:text-red">
                      Delete
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {popup && (
        <div
          ref={popupRef}
          // Leaflet's own panes/controls use z-index up to 1000 internally
          // (its zoom buttons and attribution sit at 1000) — z-50 was only
          // ever safely above the rest of this app's UI, not above a
          // Leaflet map. Once the popup could legitimately land anywhere
          // over the map (after the vertical clamp fix), it needed a
          // z-index clearly above Leaflet's own maximum to always win.
          className="fixed z-[1500] bg-white border-[1.5px] border-rule rounded-lg shadow-lg p-3 w-64"
          style={{ top: popupTop, left: popupLeft }}
        >
          {popup.mode === "add" || editingNoteId ? (
            <>
              <div className="text-[10px] font-mono uppercase tracking-widest text-mist mb-2">
                {editingNoteId ? "Edit note" : "Add a note"}
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {NOTE_CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setNoteCategory(c.value)}
                    className={`text-[11px] px-2 py-1 rounded-full border-[1.5px] font-medium ${
                      noteCategory === c.value ? "border-ink" : "border-transparent"
                    }`}
                    style={{ backgroundColor: `${c.color}22`, color: c.color }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
                placeholder="Quick note..."
                className="w-full text-sm border-[1.5px] border-rule rounded-lg p-2 mb-2 resize-none"
              />
              {noteError && <div className="text-[11px] text-red mb-2">{noteError}</div>}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={noteSaving || !noteText.trim()}
                  onClick={editingNoteId ? handleUpdateNote : handleSaveNote}
                  className="px-3 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
                >
                  {noteSaving ? "Saving..." : editingNoteId ? "Update" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPopup(null);
                    setEditingNoteId(null);
                  }}
                  className="text-xs text-mist font-semibold hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : viewedNote ? (
            <>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: categoryColor(viewedNote.category) }} />
                <span className="text-[10px] font-mono uppercase tracking-widest text-mist">{categoryLabel(viewedNote.category)}</span>
              </div>
              <div className="text-sm text-ink mb-2 whitespace-pre-wrap">{viewedNote.note}</div>
              <div className="text-[11px] text-mist mb-2">
                {authorFor(viewedNote.created_by)} ·{" "}
                {new Date(viewedNote.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
              {noteError && <div className="text-[11px] text-red mb-2">{noteError}</div>}
              {isManager && (
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => startEditNote(viewedNote)} className="text-xs text-mist font-semibold hover:text-ink">
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDeleteNote(viewedNote.id)} className="text-xs text-mist font-semibold hover:text-red">
                    Delete
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </>
  );
}
