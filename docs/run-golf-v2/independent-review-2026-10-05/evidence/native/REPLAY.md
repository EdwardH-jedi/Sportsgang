# Independent native replay

Owned iPhone 16e, iOS 26.3, 390 x 844 pt, simulator C17D665C-69FC-474D-A7B0-6EB8201128F2. Expo Go 54.0.7, review source served by Metro 8281 and API 8181, isolated sg_review_native database.

01 is default chat; 02-10 are after maximum accessibility content size and Expo Go relaunch. 03 shows Korean software keyboard, 04 English software keyboard, 05 follows a physical Send tap. sent-message-db.json is the actual read-back of the five-line message. 06 composer, 07 start picker, 08 follows physical minute-neighbour taps 15 then 30. 09 follows a real peer block through the isolated API and socket restriction. The restricted title overlaps the header and body exceeds the viewport. 10 is a physical More options tap attempt; no action sheet appeared.

11/12 changed the system content size but precede Expo Go relaunch, so they are NOT valid default-size controls. They are retained to avoid concealing the unsuccessful control setup. After relaunch, the peer was unblocked in the isolated fixture, chat was reopened and blocked again: 13 is the valid default control; 14 shows the action sheet opened by the same physical More options tap.

AX frame presence/horizontal bounds alone do not prove visible or tappable controls. The title y=2.33 and height=371.67 overlaps Back/More options y=93.67 in 09; body bottom=1010.67 exceeds the 844 pt screen. 13 places the title/body normally inside the viewport. Physical iPhone, VoiceOver, Android, signed binary and fresh 375 pt native replay were NOT_RUN.

The software keyboard was enabled only for this simulator, and text was entered via on-screen Paste. Existing simulators were not modified. The new simulator is retained shut down; private synthetic credentials and review servers/containers were removed.
