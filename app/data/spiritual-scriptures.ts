// Book of Mormon audio sections — 60 multi-chapter recordings (Joseph Smith Translation)
// Each section covers a range of chapters for a natural listening session.

export interface ScriptureSection {
  id: number;
  title: string;
  url: string;
}

export interface ScriptureBook {
  id: string;
  name: string;
  chapters: ScriptureSection[];
}

// Flat 60-section structure — each entry is a multi-chapter audio recording
export const BOOK_OF_MORMON_SECTIONS: ScriptureSection[] = [
  { id: 1,  title: "1 Nephi 1-4",                        url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/mCSkdTawdabayZwX.mp3" },
  { id: 2,  title: "1 Nephi 5-10",                       url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/HDHQIUzDmoXKKxeX.mp3" },
  { id: 3,  title: "1 Nephi 11-13",                      url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/xDCmnJRDlAjSZNfu.mp3" },
  { id: 4,  title: "1 Nephi 14-16",                      url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/wYkjCbQNbPLtdzAN.mp3" },
  { id: 5,  title: "1 Nephi 17-19",                      url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/yQzqCmPdWOXvOVgj.mp3" },
  { id: 6,  title: "1 Nephi 20-22",                      url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/mwrwfbHiZMzqXrNr.mp3" },
  { id: 7,  title: "2 Nephi 1-3",                        url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/hpLsMVNLCoAXWWJI.mp3" },
  { id: 8,  title: "2 Nephi 4-7",                        url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/dyZbHRrYujfbUOFX.mp3" },
  { id: 9,  title: "2 Nephi 8-11",                       url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/qejiBNbXAEhsVsHF.mp3" },
  { id: 10, title: "2 Nephi 12-17",                      url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/UkNRqgtZPeZIOxJa.mp3" },
  { id: 11, title: "2 Nephi 18-23",                      url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/UMYfpMihuYEoqofN.mp3" },
  { id: 12, title: "2 Nephi 24-27",                      url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/WAdGtuhrJRXYXUcz.mp3" },
  { id: 13, title: "2 Nephi 28-33",                      url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/SYiqkXOJDgoWByJD.mp3" },
  { id: 14, title: "Jacob 1-4",                          url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/HzgSmjcieRioVsVk.mp3" },
  { id: 15, title: "Jacob 5-7",                          url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/BTthdXzNtTTZJMpi.mp3" },
  { id: 16, title: "Enos 1, Jarom 1, and Omni 1",        url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/EDyAVGUHigwSXwvT.mp3" },
  { id: 17, title: "Words of Mormon 1 and Mosiah 1-3",   url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/XBlbzQTWZLDOQgFr.mp3" },
  { id: 18, title: "Mosiah 4-7",                         url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/VwXPQPvJMVJUWGFz.mp3" },
  { id: 19, title: "Mosiah 8-11",                        url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/EPneDjqlvlrwajbL.mp3" },
  { id: 20, title: "Mosiah 12-15",                       url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/rwzIEjwicMCBidIu.mp3" },
  { id: 21, title: "Mosiah 16-19",                       url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/VxRXAqssVjXGatvW.mp3" },
  { id: 22, title: "Mosiah 20-23",                       url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/XuPKwuuUEiePXIPd.mp3" },
  { id: 23, title: "Mosiah 24-27",                       url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/fDLYAVmZHiyPRIOQ.mp3" },
  { id: 24, title: "Mosiah 28-29",                       url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/YskHvPfRSxoOjHlZ.mp3" },
  { id: 25, title: "Alma 1-3",                           url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/XhOVpuGupWeQEnoQ.mp3" },
  { id: 26, title: "Alma 4-7",                           url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/jFtUzWiTzZiqxPOc.mp3" },
  { id: 27, title: "Alma 8-10",                          url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/QxVGZBTFiEOyYANr.mp3" },
  { id: 28, title: "Alma 11-13",                         url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/yiqCAOZsjzELIVaB.mp3" },
  { id: 29, title: "Alma 14-17",                         url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/zzYmjUbTcKuOcmAp.mp3" },
  { id: 30, title: "Alma 18-20",                         url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/AteYWBPcWoSuMniI.mp3" },
  { id: 31, title: "Alma 21-24",                         url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/szlidCtzpbNSYtEx.mp3" },
  { id: 32, title: "Alma 25-28",                         url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/ZbgYjWxYoxHXuHhk.mp3" },
  { id: 33, title: "Alma 29-32",                         url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/wfkVHeuzRnfOFJiD.mp3" },
  { id: 34, title: "Alma 33-34",                         url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/WjCplWcoRHNySQlE.mp3" },
  { id: 35, title: "Alma 35-37",                         url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/NesChGuIDfqMfqdl.mp3" },
  { id: 36, title: "Alma 38-41",                         url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/ErQCYVznuztMiUSa.mp3" },
  { id: 37, title: "Alma 42-45",                         url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/OlQliyAQZBeVCRsV.mp3" },
  { id: 38, title: "Alma 46-48",                         url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/aOVdVcZqDPfNbwRY.mp3" },
  { id: 39, title: "Alma 49-51",                         url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/lixHgDRTDzVaFRIU.mp3" },
  { id: 40, title: "Alma 52-55",                         url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/vWkgzXdyUVujtUja.mp3" },
  { id: 41, title: "Alma 56-58",                         url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/GHCRtLvtSYHuwhxu.mp3" },
  { id: 42, title: "Alma 59-63",                         url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/QGIegjBlVaGQhPJJ.mp3" },
  { id: 43, title: "Helaman 1-4",                        url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/abCZUtrZZMeFDnTl.mp3" },
  { id: 44, title: "Helaman 5-7",                        url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/tjKQVIUoAcNFrkMw.mp3" },
  { id: 45, title: "Helaman 8-11",                       url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/UWAmGcRBhxTkulti.mp3" },
  { id: 46, title: "Helaman 12-16",                      url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/zCJXPrQvRySCWYVd.mp3" },
  { id: 47, title: "3 Nephi 1-4",                        url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/pQNaZRgYTmebtyHh.mp3" },
  { id: 48, title: "3 Nephi 5-8",                        url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/yRRkgIKbQqfGtBMu.mp3" },
  { id: 49, title: "3 Nephi 9-13",                       url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/orMOfdZkWhjiMJvk.mp3" },
  { id: 50, title: "3 Nephi 14-17",                      url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/vdlNrkuQcbNLMICk.mp3" },
  { id: 51, title: "3 Nephi 18-20",                      url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/zPdtQRXXqSYqTIke.mp3" },
  { id: 52, title: "3 Nephi 21-26",                      url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/wJNhtfryfvDuaJvJ.mp3" },
  { id: 53, title: "3 Nephi 27-30",                      url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/gxajKspwmBLlMwBg.mp3" },
  { id: 54, title: "4 Nephi 1 and Mormon 1-3",           url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/DPsHTEKhEvmtPjgo.mp3" },
  { id: 55, title: "Mormon 4-9",                         url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/LUaUMtrTAWqpTiaf.mp3" },
  { id: 56, title: "Ether 1-4",                          url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/uumzwHiFGadgiUVn.mp3" },
  { id: 57, title: "Ether 5-9",                          url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/yjimMOSvegIawSOz.mp3" },
  { id: 58, title: "Ether 10-13",                        url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/QcyyXpJFKDuyBQME.mp3" },
  { id: 59, title: "Ether 14-15 and Moroni 1-7",         url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/wjlDaCmOvPhLIOuw.mp3" },
  { id: 60, title: "Moroni 8-10",                        url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/xtCvxhJwYamBGpPr.mp3" },
];

// Legacy alias — keeps any existing code that referenced BOOK_OF_MORMON_CHAPTERS working
// Each "book" is a single section entry so the old book-picker UI still compiles.
export const BOOK_OF_MORMON_CHAPTERS: ScriptureBook[] = BOOK_OF_MORMON_SECTIONS.map((s) => ({
  id: `section-${s.id}`,
  name: s.title,
  chapters: [{ id: 1, title: s.title, url: s.url }],
}));

// All sections as a flat array for sequential/random playback
export const ALL_BOM_CHAPTERS = BOOK_OF_MORMON_SECTIONS;

export type ScriptureSource = "book-of-mormon" | "bible";
