import { Temporal } from "@js-temporal/polyfill";
import { expect, test } from "vitest";
import { closestMonday, toPlainDateUTC } from "../src/lib/date";

test("closestMonday", () => {
  expect(
    closestMonday(Temporal.PlainDate.from("2024-11-08")).toString(),
  ).toEqual("2024-11-04");
  for (let day = 9; day <= 15; day++) {
    expect(
      closestMonday(new Temporal.PlainDate(2024, 11, day)).toString(),
    ).toEqual("2024-11-11");
  }
  expect(
    closestMonday(Temporal.PlainDate.from("2024-11-16")).toString(),
  ).toEqual("2024-11-18");
});

test("toPlainDateUTC", () => {
  expect(
    toPlainDateUTC(new Date("2024-05-11T00:00:00.000Z")).toString(),
  ).toEqual("2024-05-11");
});
