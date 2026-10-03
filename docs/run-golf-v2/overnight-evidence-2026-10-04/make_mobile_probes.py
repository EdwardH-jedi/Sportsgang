"""Create temporary reviewer tests using existing mocks; source is never repaired."""
import os,pathlib
root=pathlib.Path(os.environ['REVIEW_ROOT']);ev=pathlib.Path(os.environ['REVIEW_EVIDENCE']);tests=root/'apps/mobile/src/__tests__'
def save(name,original,marker,body):
 pre=(tests/original).read_text().split(marker)[0]
 content=pre+'\n'+body
 (ev/(name+'.test.tsx')).write_text(content)
 (tests/(name+'.test.tsx')).write_text(content)
save('codex-overnight-booking','BookingDetailScreen.test.tsx',"describe('BookingDetailScreen',",r'''
function hold<T>() {let resolve!: (v:T)=>void;let reject!:(e:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function book(id:string,status='proposed',name=`Partner ${id}`){return makeBooking({id,status,partner:{userId:'partner-222',displayName:name}});}
function screen(id:string){return <BookingDetailScreen route={makeRoute(id) as any} navigation={makeNavigation() as any}/>;}
beforeEach(()=>{jest.clearAllMocks();mockApiGet.mockReset();mockApiPost.mockReset();mockUserId='proposer-111';jest.spyOn(Alert,'alert').mockImplementation(()=>{});});
afterEach(()=>jest.restoreAllMocks());
it('CONTROL A pending -> B resolves -> A resolves keeps B and targets B',async()=>{
 const a=hold<any>(),b=hold<any>();mockApiGet.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
 const u=render(screen('A'));u.rerender(screen('B'));await act(async()=>b.resolve(book('B')));await act(async()=>a.resolve(book('A')));
 expect(u.getByText('Partner B')).toBeTruthy();expect(u.queryByText('Partner A')).toBeNull();mockApiPost.mockResolvedValue(book('B','cancelled'));await act(async()=>fireEvent.press(u.getByText('Cancel')));expect(mockApiPost).toHaveBeenCalledWith('/bookings/B/cancel',{});
});
it('R3 old transition cannot become current on route A -> B -> A',async()=>{
 const transition=hold<any>();mockApiGet.mockResolvedValueOnce(book('A')).mockResolvedValueOnce(book('B')).mockResolvedValueOnce(book('A','confirmed'));mockApiPost.mockReturnValueOnce(transition.promise);
 const u=render(screen('A'));await u.findByText('Partner A');await act(async()=>{fireEvent.press(u.getByText('Cancel'));});
 u.rerender(screen('B'));await u.findByText('Partner B');u.rerender(screen('A'));await u.findByText('Confirmed');await act(async()=>transition.resolve(book('A','cancelled')));
 expect(mockApiPost).toHaveBeenCalledWith('/bookings/A/cancel',{});expect(u.getByText('Confirmed')).toBeTruthy();expect(u.queryByText('Cancelled')).toBeNull();
});
it('R3 old transition failure cannot alert after account A -> B -> A',async()=>{
 const transition=hold<any>();mockApiGet.mockResolvedValueOnce(book('A')).mockResolvedValueOnce(book('A')).mockResolvedValueOnce(book('A'));mockApiPost.mockReturnValueOnce(transition.promise);
 const u=render(screen('A'));await u.findByText('Partner A');await act(async()=>{fireEvent.press(u.getByText('Cancel'));});
 mockUserId='account-b';u.rerender(screen('A'));await act(async()=>{});mockUserId='proposer-111';u.rerender(screen('A'));await act(async()=>{});await act(async()=>transition.reject(new Error('obsolete failure')));
 expect(Alert.alert).not.toHaveBeenCalled();
});
it('R3 old confirmation dialog must expire across A -> B -> A',async()=>{
 mockApiGet.mockResolvedValueOnce(book('A','confirmed')).mockResolvedValueOnce(book('B','confirmed')).mockResolvedValueOnce(book('A','confirmed'));mockApiPost.mockResolvedValue(book('A','no_show'));
 const u=render(screen('A'));await u.findByText('Partner A');fireEvent.press(u.getByText('Record no-show'));const buttons=(Alert.alert as jest.Mock).mock.calls[0][2];
 u.rerender(screen('B'));await u.findByText('Partner B');u.rerender(screen('A'));await u.findByText('Partner A');await act(async()=>buttons.find((b:any)=>b.text==='Record no-show').onPress());
 expect(mockApiPost).not.toHaveBeenCalled();
});
it('CONTROL old confirmation dialog sends nothing after route A -> B',async()=>{
 mockApiGet.mockResolvedValueOnce(book('A','confirmed')).mockResolvedValueOnce(book('B','confirmed'));
 const u=render(screen('A'));await u.findByText('Partner A');fireEvent.press(u.getByText('Record no-show'));const buttons=(Alert.alert as jest.Mock).mock.calls[0][2];
 u.rerender(screen('B'));await u.findByText('Partner B');await act(async()=>buttons.find((b:any)=>b.text==='Record no-show').onPress());expect(mockApiPost).not.toHaveBeenCalled();
});
it('R3 confirmation dialog must send nothing after unmount',async()=>{
 mockApiGet.mockResolvedValueOnce(book('A','confirmed'));mockApiPost.mockResolvedValue(book('A','no_show'));
 const u=render(screen('A'));await u.findByText('Partner A');fireEvent.press(u.getByText('Record no-show'));const buttons=(Alert.alert as jest.Mock).mock.calls[0][2];u.unmount();await act(async()=>buttons.find((b:any)=>b.text==='Record no-show').onPress());expect(mockApiPost).not.toHaveBeenCalled();
});
''')
save('codex-overnight-matches','MatchesScreen.test.tsx',"describe('MatchesScreen',",r'''
function hold<T>() {let resolve!:(v:T)=>void;let reject!:(e:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const response={items:[makeMatch()],total:1,limit:50,offset:0};
beforeEach(()=>{jest.clearAllMocks();mockApiGet.mockReset();mockCurrentUserId='me-user-id';});
it('R1/R4 old focus response cannot restore a blocked chat after newer empty list',async()=>{
 const old=hold<any>();mockApiGet.mockResolvedValueOnce(response).mockReturnValueOnce(old.promise).mockResolvedValueOnce(emptyResponse);
 const u=render(<MatchesScreen/>);await u.findByText('Jordan Lee');await act(async()=>{mockFocus.current?.();});await act(async()=>{mockFocus.current?.();});await u.findByText('No chats yet');await act(async()=>old.resolve(response));
 expect(u.queryByText('Jordan Lee')).toBeNull();expect(u.getByText('No chats yet')).toBeTruthy();
});
it('R4 retained screen clears matches immediately on owner replacement',async()=>{
 mockApiGet.mockResolvedValueOnce(response);const u=render(<MatchesScreen/>);await u.findByText('Jordan Lee');mockCurrentUserId='account-b';u.rerender(<MatchesScreen/>);
 expect(u.queryByText('Jordan Lee')).toBeNull();
});
it('R1 follow-up successful focus refresh recovers initial fetch failure',async()=>{
 mockApiGet.mockRejectedValueOnce(new Error('initial offline')).mockResolvedValueOnce(response);const u=render(<MatchesScreen/>);await u.findByText('initial offline');await act(async()=>{mockFocus.current?.();});
 expect(u.queryByText('initial offline')).toBeNull();expect(u.getByText('Jordan Lee')).toBeTruthy();
});
it('CONTROL first focus fetches once and next focus removes blocked chat',async()=>{
 mockApiGet.mockResolvedValueOnce(response).mockResolvedValueOnce(emptyResponse);const u=render(<MatchesScreen/>);await u.findByText('Jordan Lee');expect(mockApiGet).toHaveBeenCalledTimes(1);await act(async()=>{mockFocus.current?.();});expect(u.getByText('No chats yet')).toBeTruthy();expect(mockApiGet).toHaveBeenCalledTimes(2);
});
''')
save('codex-overnight-store','exploreStore.test.ts',"describe('focus sport',",r'''
it('R4 block completion from previous owner epoch returns stale after A -> B -> A',async()=>{
 await store().hydrateFocus('a');mockGet.mockResolvedValueOnce(page([card('target')]));await store().loadFeed();const blocked=deferred<any>();mockPost.mockReturnValueOnce(blocked.promise);const action=store().blockPartner('target');await store().hydrateFocus('b');await store().hydrateFocus('a');mockGet.mockResolvedValueOnce(page([card('target')]));await store().loadFeed();blocked.resolve({});expect(await action).toBe(false);
});
it('R4 old action finally cannot release a new same-target block guard',async()=>{
 await store().hydrateFocus('a');const old=deferred<any>(),fresh=deferred<any>();mockPost.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
 const oldAction=store().blockPartner('target');await store().hydrateFocus('b');await store().hydrateFocus('a');const newAction=store().blockPartner('target');old.resolve({});await oldAction;
 expect(store().actingOn).toBe('target');fresh.resolve({});await newAction;
});
it('R4 like completion from previous owner epoch must return null after A -> B -> A',async()=>{
 await store().hydrateFocus('a');const held=deferred<any>();mockPost.mockReturnValueOnce(held.promise);const liking=store().recordAction({...card('target'),feedSport:'running'} as any,'like');await store().hydrateFocus('b');await store().hydrateFocus('a');held.resolve({matchCreated:true,matchId:'old-match'});expect(await liking).toBeNull();
});
it('CONTROL block with held next page cannot resurrect blocked target',async()=>{
 await store().hydrateFocus('a');mockGet.mockResolvedValueOnce(page([card('target')],'cursor'));await store().loadFeed();const more=deferred<any>();mockGet.mockReturnValueOnce(more.promise);const paging=store().fetchMore();mockPost.mockResolvedValueOnce({});expect(await store().blockPartner('target')).toBe(true);more.resolve(page([card('target')]));await paging;expect(store().feed.items).toEqual([]);
});
''')
save('codex-overnight-partner','PartnerDetailScreen.test.tsx','beforeEach(async () =>',r'''
beforeEach(async()=>{jest.clearAllMocks();mockGet.mockReset();mockPost.mockReset();navigation.isFocused.mockReturnValue(true);await loadGolfFeed();});
afterEach(()=>jest.restoreAllMocks());
it('R4 block dialog opened for owner A cannot execute for owner B',async()=>{
 await useExploreStore.getState().hydrateFocus('a');useExploreStore.getState().setFocusSport('golf');mockGet.mockResolvedValueOnce({items:[golfer],total:1,limit:20,offset:0,nextCursor:null});await useExploreStore.getState().loadFeed();jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const u=renderDetail();fireEvent.press(u.getByText('Block'));const buttons=(Alert.alert as jest.Mock).mock.calls[0][2];await act(async()=>useExploreStore.getState().hydrateFocus('b'));mockPost.mockResolvedValue({});await act(async()=>buttons.find((b:any)=>b.text==='Block').onPress());expect(mockPost).not.toHaveBeenCalled();
});
it('CONTROL block completed after focus loss does not navigate',async()=>{
 let resolve!:(v:any)=>void;mockPost.mockReturnValueOnce(new Promise(a=>{resolve=a;}));jest.spyOn(Alert,'alert').mockImplementation((_t,_b,buttons)=>{buttons?.find(b=>b.text==='Block')?.onPress?.();});const u=renderDetail();fireEvent.press(u.getByText('Block'));navigation.isFocused.mockReturnValue(false);await act(async()=>resolve({}));expect(navigation.goBack).not.toHaveBeenCalled();expect(navigation.replace).not.toHaveBeenCalled();
});
''')
print('Created 16 independent acceptance tests in four temporary suites')
