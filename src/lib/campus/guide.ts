export type GuideLink = {
  name: string;
  detail: string;
  href: string;
};

export const ABOUT = {
  title: "About MUBAS",
  body: "The Malawi University of Business and Applied Sciences is a public university in Blantyre, established under the MUBAS Act of 2019. It teaches and researches across business, science, engineering and technology. Zapa only points at the public website. It is not the university, and it cannot see student records.",
  address: "Vice Chancellor, Private Bag 303, Chichiri, Blantyre 3",
  phone: "(+265) 111 870 411",
  email: "vc@mubas.ac.mw",
  site: "https://www.mubas.ac.mw/",
};

export const SCHOOLS = [
  {
    short: "SOE",
    name: "School of Engineering",
    detail: "Electrical, mechanical, civil and mining engineering.",
    href: "https://www.mubas.ac.mw/schools",
  },
  {
    short: "SOST",
    name: "School of Science and Technology",
    detail: "Computing, mathematics, food science, environment and related applied sciences.",
    href: "https://www.mubas.ac.mw/schools",
  },
  {
    short: "SOBES",
    name: "School of Business and Economic Sciences",
    detail: "Accountancy, management, finance, economics and professional business programmes.",
    href: "https://www.mubas.ac.mw/schools",
  },
  {
    short: "SECOMS",
    name: "School of Education, Communication and Media Studies",
    detail: "Education, language and communication, journalism and media.",
    href: "https://www.mubas.ac.mw/schools",
  },
  {
    short: "SOBE",
    name: "School of Built Environment",
    detail: "Architecture, surveying, real estate, planning and construction.",
    href: "https://www.mubas.ac.mw/schools",
  },
];

export const SERVICES: GuideLink[] = [
  { name: "MUBAS One", detail: "Central sign-in and password help for university systems.", href: "https://one.mubas.ac.mw/" },
  { name: "SMIS", detail: "Student information for registration and academic records.", href: "http://smis.mubas.ac.mw" },
  { name: "USIMS", detail: "Student portal for courses and results.", href: "https://usims.mubas.ac.mw" },
  { name: "Moodle", detail: "Learning platform listed on the e-services page.", href: "https://odl.mubas.ac.mw" },
  { name: "ODeL programmes", detail: "Open, distance and e-learning options on the main site.", href: "https://www.mubas.ac.mw/odel" },
  { name: "ODeL portal", detail: "Portal linked from the university e-services page.", href: "https://odl.poly.ac.mw/" },
  { name: "Academic calendar", detail: "Dates published by the office of the Deputy Vice Chancellor.", href: "https://calendar.mubas.ac.mw/" },
  { name: "Teaching timetable", detail: "Class and event times.", href: "https://timetable.mubas.ac.mw/" },
  { name: "Accommodation", detail: "Student housing information and applications.", href: "https://accommodation.mubas.ac.mw" },
  { name: "Publications", detail: "University research outputs and theses.", href: "https://publications.mubas.ac.mw/" },
  { name: "ICT support", detail: "Report a technical problem to the ICT Support Centre.", href: "https://support.poly.ac.mw" },
  { name: "Document verification", detail: "Check certificates, transcripts and identity cards issued by MUBAS.", href: "https://verify.mubas.ac.mw" },
  { name: "Appeals", detail: "Submit a formal academic appeal.", href: "https://appeals.mubas.ac.mw/" },
  { name: "Course evaluation", detail: "Feedback on courses and lecturers.", href: "https://evaluation.mubas.ac.mw" },
  { name: "Admissions", detail: "How to apply, including international guidance.", href: "https://www.mubas.ac.mw/admissions/how-to-apply" },
  { name: "Fees and aid", detail: "Tuition and financial aid published by the university.", href: "https://www.mubas.ac.mw/admissions/tuition-fees-financial-aid" },
  { name: "Programmes", detail: "The official programme list. Zapa’s directory is only a starter.", href: "https://www.mubas.ac.mw/programmes" },
  { name: "News", detail: "University news and events.", href: "https://www.mubas.ac.mw/news" },
  { name: "Vacancies", detail: "Jobs and calls published by MUBAS.", href: "https://www.mubas.ac.mw/vacancies" },
  { name: "Contact", detail: "Official contact details.", href: "https://www.mubas.ac.mw/contact" },
  { name: "Campus life", detail: "Student life pages on the university site.", href: "https://www.mubas.ac.mw/campus-life" },
  { name: "E-services index", detail: "The full list, including the e-library entry.", href: "https://www.mubas.ac.mw/eservices" },
  { name: "Estates support", detail: "Maintenance and estates requests.", href: "https://estates.mubas.ac.mw" },
  { name: "Unipod", detail: "Innovation hub for prototyping and incubation.", href: "https://unipod.ac.mw/" },
];

export const FAQS = [
  {
    q: "Is Zapa an official MUBAS system?",
    a: "No. Zapa is an independent campus community. Registration, fees, results and official notices live on the university’s own sites. A post here is never an official announcement unless it clearly links to the original and says who wrote it.",
  },
  {
    q: "Who can join?",
    a: "New email accounts must use an @mubas.ac.mw address. That check shows the address is on the university domain. It does not prove you are enrolled. Mailbox confirmation runs when the campus email service is connected.",
  },
  {
    q: "Where are files kept?",
    a: "Posts and messages stay in the campus database. Photos on your profile stay with your account. Library items and Zapa Watch entries are links. Do not post private documents, unreleased exams, or anything you do not have the right to share.",
  },
  {
    q: "How do I report someone?",
    a: "Open More on a post, message, video or profile and choose Report. Stewards can hide the item or suspend the account. Impersonating a lecturer or a university office is not allowed.",
  },
];
