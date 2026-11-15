import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getDiscover, listDirectory } from "@/lib/campus/server";
import { ACADEMIC_YEARS, RANK_LABEL, STUDY_LEVELS, STUDY_MODES } from "@/lib/campus/logic";
import { PersonRow, RequestRow } from "@/components/people";
import { Card, LoadError, Skeleton, unwrap, useLoad } from "@/components/page-kit";
import { btnQuiet, Empty, Field, input, PageTitle } from "@/components/ui";

export const Route = createFileRoute("/campus/discover")({
  head: () => ({ meta: [{ title: "Discover — Zapa MUBAS" }] }),
  component: Discover,
});

const BLANK = { schoolId: "", programmeId: "", studyLevel: "", studyMode: "", academicYear: "", interest: "" };

function Discover() {
  const [filters, setFilters] = useState(BLANK);
  const directory = useLoad(() => listDirectory(), []);
  const query = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
  const { data, error, loading, reload } = useLoad(() => unwrap(getDiscover({ data: query })), [JSON.stringify(query)]);
  const programmes = (directory.data?.programmes ?? []).filter((item) => !filters.schoolId || item.schoolId === filters.schoolId);
  const set = (key: keyof typeof BLANK, value: string) => setFilters((current) => ({ ...current, [key]: value, ...(key === "schoolId" ? { programmeId: "" } : {}) }));
  const filtered = Object.values(filters).some(Boolean);

  const groups: { rank: number; people: NonNullable<typeof data>["people"] }[] = [];
  for (const person of data?.people ?? []) {
    const last = groups[groups.length - 1];
    if (last && last.rank === person.rank) last.people.push(person);
    else groups.push({ rank: person.rank, people: [person] });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle title="Discover people" lede="Classmates come first, then your department, school and study mode. Narrow it down with the filters." />
      <section className="panel mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="School">
          <select className={input} value={filters.schoolId} onChange={(e) => set("schoolId", e.target.value)}>
            <option value="">All schools</option>
            {(directory.data?.schools ?? []).map((school) => <option key={school.id} value={school.id}>{school.shortName} · {school.name}</option>)}
          </select>
        </Field>
        <Field label="Programme">
          <select className={input} value={filters.programmeId} onChange={(e) => set("programmeId", e.target.value)}>
            <option value="">All programmes</option>
            {programmes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Level">
          <select className={input} value={filters.studyLevel} onChange={(e) => set("studyLevel", e.target.value)}>
            <option value="">Any level</option>
            {STUDY_LEVELS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Study mode">
          <select className={input} value={filters.studyMode} onChange={(e) => set("studyMode", e.target.value)}>
            <option value="">Any mode</option>
            {STUDY_MODES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Year">
          <select className={input} value={filters.academicYear} onChange={(e) => set("academicYear", e.target.value)}>
            <option value="">Any year</option>
            {ACADEMIC_YEARS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Interest">
          <input className={input} value={filters.interest} onChange={(e) => set("interest", e.target.value)} placeholder="e.g. robotics" />
        </Field>
        {filtered ? <button type="button" className={`${btnQuiet} justify-self-start text-denim-deep`} onClick={() => setFilters(BLANK)}>Clear filters</button> : null}
      </section>

      {data?.incoming.length ? (
        <div className="mb-4">
          <Card title="Friend requests">
            <div className="grid gap-2">
              {data.incoming.map((request) => (
                <RequestRow key={request.id} id={request.id} userId={request.userId} fullName={request.fullName} programmeName={request.programmeName} onChange={reload} />
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {loading && !data ? (
        <Skeleton rows={4} />
      ) : error ? (
        <LoadError message={error} onRetry={reload} />
      ) : groups.length === 0 ? (
        <Empty title="Nobody matches yet" body="Try fewer filters. New students join every day." />
      ) : (
        <div className="grid gap-6">
          {groups.map((group) => (
            <section key={group.rank}>
              <h2 className="mb-2 text-sm font-semibold tracking-wide text-denim-deep">{(RANK_LABEL[group.rank] || "Other MUBAS students").toUpperCase()}</h2>
              <div className="grid gap-2">
                {group.people.map((person) => <PersonRow key={person.userId} person={person} onChange={reload} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
