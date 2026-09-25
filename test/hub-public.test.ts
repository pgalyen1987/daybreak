import { afterEach, describe, expect, it, vi } from "vitest";
import { countFollows, fidForName } from "@/lib/hub-public";

/**
 * The follow count is the number the whole site now stands on, and the thing that can silently
 * break it is the hub's paging: the node answers from several shards, repeats rows it has already
 * handed over, and keeps returning a pageToken long after the last new record. Counting @jacob for
 * real converged at 478,377 by page 240 and the node was still paging at page 400. So these pin
 * the two behaviours that matter — it must not stop early, and it must not loop forever.
 */
const page = (fids: number[], token: string | null, target = 8) => ({
  messages: fids.map((fid) => ({ data: { type: "MESSAGE_TYPE_LINK_ADD", fid, timestamp: 1, linkBody: { targetFid: target } } })),
  nextPageToken: token,
});

const serve = (pages: unknown[]) => {
  let i = 0;
  return vi.fn(async () => ({ ok: true, status: 200, json: async () => pages[Math.min(i++, pages.length - 1)] })) as unknown as typeof fetch;
};

afterEach(() => vi.unstubAllGlobals());

describe("countFollows", () => {
  it("counts distinct signers, not messages: a repeated page adds nobody", async () => {
    vi.stubGlobal("fetch", serve([page([1, 2, 3], "t1"), page([2, 3, 4], "t2"), page([], null)]));
    expect(await countFollows(8)).toMatchObject({ count: 4, converged: true });
  });

  it("stops when pages stop adding anyone, even while the node keeps handing back a token", async () => {
    // page 1 is new, then the tail repeats for ever with a token every time
    vi.stubGlobal("fetch", serve([page([1, 2, 3], "t"), page([1, 2, 3], "t")]));
    const r = await countFollows(8, { stallPages: 4, maxPages: 500 });
    expect(r).toMatchObject({ count: 3, converged: true });
    expect(r.pages).toBeLessThan(10); // it must not read the tail 500 times
  });

  it("does not stop on one dud page: shards page unevenly", async () => {
    vi.stubGlobal("fetch", serve([page([1], "a"), page([1], "b"), page([2], "c"), page([], null)]));
    expect(await countFollows(8, { stallPages: 3 })).toMatchObject({ count: 2, converged: true });
  });

  it("a walk that hits its cap reports converged false, so callers know it is a floor", async () => {
    vi.stubGlobal("fetch", serve([page([1], "a"), page([2], "b"), page([3], "c")]));
    const r = await countFollows(8, { maxPages: 2, stallPages: 8 });
    expect(r.converged).toBe(false);
    expect(r.count).toBeLessThanOrEqual(2);
  });

  it("ignores follows aimed at someone else and message types that are not a follow add", async () => {
    vi.stubGlobal("fetch", serve([{
      messages: [
        { data: { type: "MESSAGE_TYPE_LINK_ADD", fid: 1, linkBody: { targetFid: 8 } } },
        { data: { type: "MESSAGE_TYPE_LINK_ADD", fid: 2, linkBody: { targetFid: 99 } } },
        { data: { type: "MESSAGE_TYPE_LINK_REMOVE", fid: 3, linkBody: { targetFid: 8 } } },
      ],
      nextPageToken: null,
    }]));
    expect((await countFollows(8)).count).toBe(1);
  });
});

describe("fidForName", () => {
  it("reads the fid out of the hub's username proof", async () => {
    vi.stubGlobal("fetch", serve([{ name: "jacob", fid: 8, type: "USERNAME_TYPE_FNAME" }]));
    expect(await fidForName("jacob")).toBe(8);
  });
  it("is null when the hub has no proof, rather than guessing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch);
    expect(await fidForName("nobody")).toBeNull();
  });
});
