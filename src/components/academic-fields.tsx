import type { Directory } from "@/lib/campus/types";
import { ACADEMIC_YEARS, STUDY_LEVELS, STUDY_MODES } from "@/lib/campus/logic";
import { Field, input } from "@/components/ui";

export type Draft = {
  fullName: string;
  campusEmail: string;
  role: "student" | "lecturer" | "staff";
  schoolId: string;
  programmeId: string;
  studyLevel: string;
  studyMode: string;
  academicYear: string;
  interests: string;
  departmentNote: string;
};

export const emptyDraft: Draft = {
  fullName: "",
  campusEmail: "",
  role: "student",
  schoolId: "",
  programmeId: "",
  studyLevel: "Undergraduate",
  studyMode: "Full-time",
  academicYear: "Year 1",
  interests: "",
  departmentNote: "",
};

export function AcademicFields({
  directory,
  value,
  onChange,
  lockEmail = false,
}: {
  directory: Directory;
  value: Draft;
  onChange: (next: Draft) => void;
  lockEmail?: boolean;
}) {
  const programmes = directory.programmes.filter((item) => item.schoolId === value.schoolId);
  const programme = programmes.find((item) => item.id === value.programmeId);
  const showDepartment = value.role !== "student" || !programme || programme.id.startsWith("other-");

  return (
    <div className="grid gap-3">
      <Field label="Full name">
        <input
          className={input}
          value={value.fullName}
          autoComplete="name"
          onChange={(event) => onChange({ ...value, fullName: event.target.value })}
        />
      </Field>
      <Field label="Official MUBAS email">
        <input
          className={input}
          type="email"
          autoComplete="email"
          disabled={lockEmail}
          value={value.campusEmail}
          placeholder="name@mubas.ac.mw"
          onChange={(event) => onChange({ ...value, campusEmail: event.target.value })}
        />
      </Field>
      <Field label="I am joining as">
        <select
          className={input}
          value={value.role}
          onChange={(event) =>
            onChange({ ...value, role: event.target.value as Draft["role"] })
          }
        >
          <option value="student">Student</option>
          <option value="lecturer">Lecturer</option>
          <option value="staff">University staff</option>
        </select>
      </Field>
      <Field label="School">
        <select
          className={input}
          value={value.schoolId}
          onChange={(event) =>
            onChange({ ...value, schoolId: event.target.value, programmeId: "", departmentNote: "" })
          }
        >
          <option value="">Choose a school</option>
          {directory.schools.map((school) => (
            <option key={school.id} value={school.id}>
              {school.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Programme">
        <select
          className={input}
          value={value.programmeId}
          onChange={(event) => {
            const next = programmes.find((item) => item.id === event.target.value);
            onChange({
              ...value,
              programmeId: event.target.value,
              studyLevel: next?.level || value.studyLevel,
              departmentNote: next && !next.id.startsWith("other-") ? next.department : "",
            });
          }}
        >
          <option value="">{value.role === "student" ? "Choose a programme" : "Optional"}</option>
          {programmes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      {showDepartment ? (
        <Field label="Department">
          <input
            className={input}
            value={value.departmentNote}
            onChange={(event) => onChange({ ...value, departmentNote: event.target.value })}
          />
        </Field>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Study level">
          <select
            className={input}
            value={value.studyLevel}
            onChange={(event) => onChange({ ...value, studyLevel: event.target.value })}
          >
            {STUDY_LEVELS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label="Study mode">
          <select
            className={input}
            value={value.studyMode}
            onChange={(event) => onChange({ ...value, studyMode: event.target.value })}
          >
            {STUDY_MODES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label="Year or intake">
          <select
            className={input}
            value={value.academicYear}
            onChange={(event) => onChange({ ...value, academicYear: event.target.value })}
          >
            {ACADEMIC_YEARS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Interests, optional">
        <input
          className={input}
          placeholder="Debate, Python, football"
          value={value.interests}
          onChange={(event) => onChange({ ...value, interests: event.target.value })}
        />
      </Field>
      <p className="text-xs text-pretty text-muted">
        Programme names are a starter directory so classmates can find each other. The official list is on mubas.ac.mw.
        A lecturer or staff choice is self-identified until a steward confirms it.
      </p>
    </div>
  );
}
