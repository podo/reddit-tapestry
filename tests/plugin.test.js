const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../local.reddit.home/plugin.js','utf8');
const factory=(x={})=>Object.assign({},x);
const privateUrl='https://www.reddit.com/.json?feed=SECRET&user=test';
const c={
  site:privateUrl,private_feed_url:'',feed_name:'',feed_source:'home',subreddit_name:'',include_nsfw:'off',include_subreddit:'on',include_flair:'on',show_metrics:'on',initial_history:'100',
  Identity:{createWithName:name=>factory({name})},
  Annotation:{createWithText:text=>factory({text})},
  Item:{createWithUriDate:(uri,date)=>factory({uri,date})},
  MediaAttachment:{createWithUrl:url=>factory({url})},
  LinkAttachment:{createWithUrl:url=>factory({url})},
  PollAttachment:{create:options=>factory({options})},
  PollOption:{create:(title,votes)=>factory({title,votes})},
  getItem:()=>null,setItem(){},processResults(){},processError:e=>{throw e},processVerification(){},
  raiseCondition(){},actionComplete(){},
  sendRequest:()=>Promise.reject(Error('network disabled')),
  sendConditionalRequest:()=>Promise.reject(Error('network disabled')),
  Promise,Error,Date,JSON,Math,String,Array,RegExp,parseInt,isNaN,encodeURIComponent,encodeURI
};
vm.createContext(c);vm.runInContext(source,c);
assert.equal(c.normalizedPrivateUrl(),privateUrl);
assert.equal(c.listingPageUrl(privateUrl,null),privateUrl+'&raw_json=1&limit=100');
assert.equal(c.listingPageUrl(privateUrl,'t3_abc'),privateUrl+'&raw_json=1&limit=100&after=t3_abc');
assert.equal(c.feedDisplayName(),'Reddit · Private Feed');
c.feed_name='Saved';assert.equal(c.feedDisplayName(),'Reddit · Saved');
c.feed_name='Reddit - Private Feed';assert.equal(c.feedDisplayName(),'Reddit · Private Feed');
c.feed_name='Reddit · Private Feed';assert.equal(c.feedDisplayName(),'Reddit · Private Feed');
c.feed_name='';
const post={id:'abc',name:'t3_abc',title:'Example',author:'alice',created_utc:1700000000,permalink:'/r/test/comments/abc/example/',subreddit:'test',subreddit_name_prefixed:'r/test',selftext_html:'&lt;p&gt;Hello&lt;/p&gt;',score:1234,num_comments:56,is_self:true,over_18:false,link_flair_text:'News',link_flair_richtext:[{e:'emoji',a:':fire:',u:'https://emoji.example/fire.png'}]};
const item=c.itemForData(post);
assert.equal(item.title,'Example');
assert.equal(item.author.name,'alice');
assert.equal(item.annotations.length,1);
assert.equal(item.annotations[0].text,'News in r/test');
assert.equal(item.annotations[0].uri,'https://www.reddit.com/r/test');
assert.ok(!item.annotations.some(a=>/Reddit ·/.test(a.text)));
assert.ok(item.body.startsWith('<p class="reddit-meta-metrics"><small>1.2k points · 56 comments</small></p>'));
assert.ok(item.body.includes('<p>Hello</p>'));
assert.ok(item.body.indexOf('reddit-meta-metrics') < item.body.indexOf('<p>Hello</p>'));
assert.equal(item.shortcodes.fire,'https://emoji.example/fire.png');
assert.ok(item.actions.comments);
assert.equal(item.actions._connectorBuild,'reddit@plugin8@2.1.0');
assert.equal(item.actions.openLink,undefined);
const pinned=c.itemForData({...post,stickied:true});
assert.equal(pinned.annotations.length,2);
assert.equal(pinned.annotations[1].text,'Pinned');
c.include_flair='off';
assert.equal(c.itemForData(post).annotations[0].text,'r/test');
c.include_flair='on';c.include_subreddit='off';
assert.equal(c.itemForData(post).annotations,undefined);
c.include_subreddit='on';
c.show_metrics='off';
assert.ok(!c.itemForData(post).body.includes('reddit-meta-metrics'));
assert.ok(c.itemForData(post).body.includes('<p>Hello</p>'));
c.show_metrics='on';
const linkPost={...post,id:'link',name:'t3_link',is_self:false,domain:'example.com',url:'https://example.com/story',preview:{images:[{source:{url:'https://i.redd.it/a.jpg',width:100,height:50}}]}};
const linkItem=c.itemForData(linkPost);
assert.ok(linkItem.attachments.some(a=>a.url==='https://i.redd.it/a.jpg'));
assert.ok(linkItem.attachments.some(a=>a.url==='https://example.com/story' && a.title));
const pollPost={...post,id:'poll',name:'t3_poll',poll_data:{options:[{text:'A',vote_count:3},{text:'B',vote_count:1}],voting_end_timestamp:1700001000000}};
assert.ok(c.itemForData(pollPost).attachments.some(a=>a.options && a.options.length===2));
const nsfwPost={...post,id:'nsfw',name:'t3_nsfw',over_18:true};
assert.equal(c.acceptedChildCount([{data:post},{data:nsfwPost},{data:post}],100),1);
assert.equal(c.itemsForChildren([{data:post},{data:nsfwPost},{data:post}],100).length,1);
c.site='https://www.reddit.com/r/test/new.json';assert.equal(c.normalizedPrivateUrl(),'');
c.site='https://www.reddit.com/.json?user=test';assert.equal(c.privateFeedUrl(),'');
c.site='';c.private_feed_url=privateUrl;assert.equal(c.normalizedPrivateUrl(),privateUrl);
c.site=privateUrl;c.private_feed_url='https://www.reddit.com/.json?feed=OLD';assert.equal(c.normalizedPrivateUrl(),privateUrl);
c.site='';c.private_feed_url='';c.feed_source='saved';
assert.equal(c.usesPrivateFeedUrl(),false);
assert.equal(c.oauthListingBaseUrl(),'https://oauth.reddit.com/user/me/saved');
assert.equal(c.feedDisplayName(),'Reddit · Saved');
c.feed_source='subreddit';c.subreddit_name='technology';
assert.equal(c.oauthListingBaseUrl(),'https://oauth.reddit.com/r/technology/hot');
assert.throws(()=>{c.subreddit_name='';c.oauthListingBaseUrl();},/subreddit name/);
(async()=>{
  c.sendRequest=()=>Promise.resolve(JSON.stringify({status:200,body:JSON.stringify({data:{children:[]}})}));
  assert.equal((await c.requestListing(privateUrl,false)).data.children.length,0);
  c.sendConditionalRequest=()=>Promise.resolve(JSON.stringify({status:304,body:''}));
  assert.equal(await c.requestListing(privateUrl,true),null);
  assert.equal(await c.fetchListingPages(privateUrl,1,true,100),null);
  let raised=null;
  c.raiseCondition=(type,title,message)=>{raised={type,title,message};};
  c.site=privateUrl;
  c.sendRequest=()=>Promise.resolve(JSON.stringify({status:403,body:''}));
  await assert.rejects(()=>c.requestListing(privateUrl,false),/HTTP 403/);
  assert.equal(raised.type,'disable');
  c.site='';
  c.sendRequest=()=>Promise.resolve(JSON.stringify({status:401,body:''}));
  raised=null;
  await assert.rejects(()=>c.requestListing('https://oauth.reddit.com/hot',false),/Sign in/);
  assert.equal(raised.type,'authorize');
  const commentJson=[
    {data:{children:[{kind:'t3',data:post}]}},
    {data:{children:[{kind:'t1',data:{id:'c1',author:'bob',created_utc:1700000100,permalink:'/r/test/comments/abc/example/c1/',body:'Nice',body_html:'&lt;p&gt;Nice&lt;/p&gt;',replies:''}}]}}
  ];
  c.sendRequest=()=>Promise.resolve(JSON.stringify({status:200,body:JSON.stringify(commentJson)}));
  const context=await c.loadCommentContext(item, JSON.stringify({permalink:item.uri}));
  assert.equal(context.length,2);
  assert.equal(context[1].author.name,'bob');
  console.log('plugin tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
