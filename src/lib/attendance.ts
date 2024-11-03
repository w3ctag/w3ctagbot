import { prisma } from "./prisma";
import { membersActiveOnDate, type TagMemberId } from "./tag-members";
import { notNull } from "./util";

/** Returns the TAG term that `date` falls within.
 * The term from 2023-Feb-1 to 2024-Feb-1 is named "2023".
 */
function dateToTerm(date: Date): number {
  if (date.getMonth() === 0) {
    // January
    return date.getFullYear() - 1;
  }
  return date.getFullYear();
}

export type AttendanceSummary = {
  /** Maps a term year to the meeting attendance within that year. */
  byTerm: Map<
    number,
    {
      totalMeetings: number;
      /** Sorted descending by the number of meetings attended. */
      attendance: Array<{
        memberId: TagMemberId;
        attended: number;
        /** attended/totalMeetings */
        fraction: number;
      }>;
    }
  >;
  allMeetings: {
    date: Date;
    attendees: string[];
  }[];
};

export async function summarizeAttendance(): Promise<AttendanceSummary> {
  const meetingAttendees = (
    await prisma.meetingSession.findMany({
      where: {
        attendees: { some: {} },
      },
      select: {
        meetingYear: true,
        meetingName: true,
        attendees: { select: { attendeeId: true } },
      },
      orderBy: [{ meetingYear: "asc" }, { meetingName: "asc" }],
    })
  )
    .map(({ meetingYear, meetingName, attendees }) => {
      const mmdd = /^(?<month>\d+)-(?<day>\d+)$/.exec(meetingName);
      // If anything is null, the Date will wind up invalid, so we just check for that.
      const month = mmdd?.groups?.month;
      const day = mmdd?.groups?.day;
      const date = new Date(`${meetingYear}-${month}-${day}`);
      if (isNaN(date.getTime())) {
        return null;
      }
      const activeMembers = membersActiveOnDate(date);
      return {
        date,
        attendees: attendees
          .map(({ attendeeId }) => attendeeId)
          // Don't include former or future TAG members who are just visiting a given meeting.
          .filter((attendee): attendee is TagMemberId =>
            activeMembers.has(attendee as TagMemberId),
          ),
      };
    })
    .filter(notNull);

  type Term = number;
  const byTerm = new Map<
    Term,
    {
      totalMeetings: number;
      attendance: Map<TagMemberId, number>;
    }
  >();
  for (const meeting of meetingAttendees) {
    const term = dateToTerm(meeting.date);
    let termInfo = byTerm.get(term);
    if (termInfo === undefined) {
      termInfo = {
        totalMeetings: 0,
        attendance: new Map<TagMemberId, number>(),
      };
      byTerm.set(term, termInfo);
    }
    termInfo.totalMeetings++;

    let termMemberAttendance = termInfo.attendance;
    for (const attendee of meeting.attendees) {
      termMemberAttendance.set(
        attendee,
        (termMemberAttendance.get(attendee) ?? 0) + 1,
      );
    }
  }

  return {
    byTerm: new Map(
      Array.from(byTerm.entries())
        .sort(([a, _1], [b, _2]) => b - a)
        .map(([term, { totalMeetings, attendance }]) => [
          term,
          {
            totalMeetings,
            attendance: Array.from(
              attendance.entries(),
              ([memberId, attended]) => ({
                memberId: memberId as TagMemberId,
                attended,
                fraction: attended / totalMeetings,
              }),
            ).sort(({ attended: a }, { attended: b }) => b - a),
          },
        ]),
    ),
    allMeetings: meetingAttendees,
  };
}
