import { hasOwn } from "./util";

export type TagMember = {
  name: string;
  ghLogin: string;
  terms: { start: Date; end: Date }[];
  attendanceAliases: string[];
};

function term(start: string, end: string) {
  return { start: new Date(start), end: new Date(end) };
}

export const tagMembers = {
  "MDQ6VXNlcjI4NzUyNg==": {
    name: "Daniel Appelquist",
    ghLogin: "torgo",
    terms: [term("2010-02-01", "2012-02-01"), term("2013-06-01", "2026-02-01")],
    attendanceAliases: ["dan", "torgo"],
  },
  "MDQ6VXNlcjU0NTA5NTA=": {
    name: "Rossen Atanassov",
    ghLogin: "atanassov",
    terms: [term("2020-02-01", "2024-02-01")],
    attendanceAliases: ["rossen", "rossem", "rosson"],
  },
  "MDQ6VXNlcjExMjU1MjI=": {
    name: "Matthew Tylee Atkinson",
    ghLogin: "matatk",
    terms: [term("2024-02-01", "2026-02-01")],
    attendanceAliases: ["matthew", "matt"],
  },
  "MDQ6VXNlcjI0ODcyMQ==": {
    name: "David Baron",
    ghLogin: "dbaron",
    terms: [term("2015-05-12", "2021-02-01")],
    attendanceAliases: ["david"],
  },
  "MDQ6VXNlcjE2MjY5ODA=": {
    name: "Hadley Beeman",
    ghLogin: "hadleybeeman",
    terms: [term("2015-04-15", "2025-02-01")],
    attendanceAliases: ["hadley"],
  },
  /*"MDQ6VXNlcjEyNTQ4NDg=": {
    name: "Tim Berners-Lee",
    ghLogin: "timbl",
    terms: [term("2001-12-10", "9999-02-01")],
    attendanceAliases: [],
  },*/
  MDQ6VXNlcjk1MjA4: {
    name: "Alice Boxhall",
    ghLogin: "alice",
    terms: [term("2019-02-01", "2021-02-01")],
    attendanceAliases: ["alice"],
  },
  "MDQ6VXNlcjExMDEzMzk=": {
    name: "Kenneth Rohde Christiansen",
    ghLogin: "kenchris",
    terms: [term("2018-04-02", "2022-02-01")],
    attendanceAliases: ["ken", "kenneth"],
  },
  "MDQ6VXNlcjQ2NjIyOQ==": {
    name: "Amy Guy",
    ghLogin: "rhiaro",
    terms: [term("2021-02-01", "2025-02-01")],
    attendanceAliases: ["amy", "rhiaro"],
  },
  "MDQ6VXNlcjU4NDYwNw==": {
    name: "Yves Lafon",
    ghLogin: "ylafon",
    terms: [term("2011-02-01", "9999-02-01")],
    attendanceAliases: ["yves"],
  },
  "MDQ6VXNlcjI2OTk2ODk=": {
    name: "Peter Linss",
    ghLogin: "plinss",
    terms: [term("2011-02-01", "2013-02-01"), term("2013-06-01", "2025-02-01")],
    attendanceAliases: ["peter"],
  },
  "MDQ6VXNlcjE1NjE2MzA=": {
    name: "Dapeng(Max) Liu",
    ghLogin: "maxpassion",
    terms: [term("2022-02-01", "2026-02-01")],
    attendanceAliases: ["dapeng", "max", "liu"],
  },
  MDQ6VXNlcjQzOTI0: {
    name: "Sangwhan Moon",
    ghLogin: "cynthia",
    terms: [term("2017-02-01", "2024-02-01")],
    attendanceAliases: ["sangwhan", "sanghwan"],
  },
  "MDQ6VXNlcjQ5NTA4Mg==": {
    name: "Tristan Nitot",
    ghLogin: "nitot",
    terms: [term("2024-07-15", "2026-02-01")],
    attendanceAliases: ["tristan"],
  },
  "MDQ6VXNlcjYyMzU=": {
    name: "Theresa O'Connor",
    ghLogin: "hober",
    terms: [term("2019-02-01", "2025-02-01")],
    attendanceAliases: ["tess", "hober"],
  },
  MDQ6VXNlcjEzOTUxODUz: {
    name: "Lukasz Olejnik",
    ghLogin: "lknik",
    terms: [term("2018-02-01", "2020-02-01")],
    attendanceAliases: ["lukasz"],
  },
  MDQ6VXNlcjY3NjQx: {
    name: "Martin Thomson",
    ghLogin: "martinthomson",
    terms: [term("2024-02-01", "2026-02-01")],
    attendanceAliases: ["martin", "martin thompson"],
  },
  "MDQ6VXNlcjE3NTgzNg==": {
    name: "Lea Verou",
    ghLogin: "LeaVerou",
    terms: [term("2021-02-01", "2025-02-01")],
    attendanceAliases: ["lea"],
  },
  MDQ6VXNlcjgzNDIw: {
    name: "Jeffrey Yasskin",
    ghLogin: "jyasskin",
    terms: [term("2024-07-15", "2026-02-01")],
    attendanceAliases: ["jeffrey"],
  },
} as const satisfies { [id: string]: TagMember };

export type TagMemberId = keyof typeof tagMembers;

export const tagMemberIdsByAttendanceName: ReadonlyMap<string, string> =
  (function () {
    const result = new Map<string, string>();
    for (const [id, member] of Object.entries(tagMembers)) {
      for (const alias of member.attendanceAliases) {
        if (result.has(alias)) {
          throw new Error(`${alias} is used by multiple TAG members`);
        }
        result.set(alias, id);
      }
    }
    return result;
  })();

export function membersActiveOnDate(date: Date): Set<TagMemberId> {
  const result = new Set<TagMemberId>();
  for (const [memberId, { terms }] of Object.entries(tagMembers)) {
    if (terms.some((term) => term.end > date && term.start <= date)) {
      result.add(memberId as TagMemberId);
    }
  }
  return result;
}

export function githubIdIsTagMemberOnDate(id: string, date: Date): boolean {
  if (!hasOwn(tagMembers, id)) {
    return false;
  }
  const member = tagMembers[id];
  return member.terms.some((term) => term.end > date && term.start <= date);
}
