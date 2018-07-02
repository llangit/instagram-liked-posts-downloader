const puppeteer = require('puppeteer');
const request = require('request-promise');
const chalk = require('chalk');
const moment = require('moment');
const argv = require('minimist')(process.argv.slice(2));
const download = require('download-file');

const config = { all: false };

if (argv.user) { config.u = argv.user; }
else if (argv.u) { config.u = argv.u; }
else { return console.log(chalk.red('Please specify a username with the --user or --u flag.')); }

if (argv.password) { config.pw = argv.password; }
else if (argv.pw) { config.pw = argv.pw; }
else { return console.log(chalk.red('Please specify a password with the --password or --pw flag.')); }

if (argv.profile) { config.pr = argv.profile; }
else if (argv.pr) { config.pr = argv.pr; }
else { return console.log(chalk.red('Please specify a profile with the --profile or --pr flag.')); }

if (argv.postsnumber) { config.pn = argv.postsnumber; }
else if (argv.pn) { config.pn = argv.pn; }
// else { config.pn = 50; }

if (argv.all) { config.all = true; }



(async () => {

  console.time('instaload execution time');

  const browser = await puppeteer.launch();
  const page = await browser.newPage();


  // Login
  console.log(chalk.cyan(`Logging into Instagram account '${config.u}'`));
  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2' });
  await page.type('input[name="username"]', config.u);
  await page.type('input[name="password"]', config.pw);
  await page.click('form span button');
  await page.waitForNavigation();
  console.log(chalk.green('✔ Logged in successfully'));


  // Go to profile
  console.log(chalk.cyan(`Going to profile '${config.pr}'`));
  await page.goto(`https://www.instagram.com/${config.pr}/`, { waitUntil: 'networkidle2' });


  // Get cookies (required for Instagram GraphQL request)
  let cookies = await page.cookies();
  let cookieString = '';
  for ( let key in cookies ) {
    cookieString += cookies[key].name + '=' + cookies[key].value + '; ';
  }

  // Get user ID of the profile
  let userId = await page.evaluate(() => window._sharedData.entry_data.ProfilePage[0].graphql.user.id);

  let edges = [];

  console.log(chalk.cyan(`Querying posts...`));

  // Query Instagram GraphQL
  async function queryInsta() {

    try {

      let first;
      if (config.pn) {
        if (parseInt(config.pn) > 50) { first = 50; }
        else { first = parseInt(config.pn); }
      }
      else { first = 50; }
      let queryVars = { 'id': userId, 'first': first };
      let endCursor = '';

      await request({
        method: 'GET',
        uri: 'https://www.instagram.com/graphql/query/?query_hash=42323d64886122307be10013ad2dcc44&variables=' + JSON.stringify(queryVars),
        gzip: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.87 Safari/537.36',
          'cookie': cookieString
        }
      }, function (error, response, body) {
        let data = JSON.parse(body);
        edges = data.data.user.edge_owner_to_timeline_media.edges;
        if (data.data.user.edge_owner_to_timeline_media.page_info.has_next_page) {                   
          endCursor = data.data.user.edge_owner_to_timeline_media.page_info.end_cursor;
        }
      });

      while ( edges.length < parseInt(config.pn) ) {

        queryVars.after = endCursor;
        
        await request({
          method: 'GET',
          uri: 'https://www.instagram.com/graphql/query/?query_hash=42323d64886122307be10013ad2dcc44&variables=' + JSON.stringify(queryVars),
          gzip: true,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.87 Safari/537.36',
            'cookie': cookieString
          }
        }, function (error, response, body) {
          let data = JSON.parse(body);
          let newEdges = data.data.user.edge_owner_to_timeline_media.edges;
          Array.prototype.push.apply(edges, newEdges);
          if (data.data.user.edge_owner_to_timeline_media.page_info.has_next_page) {
            endCursor = data.data.user.edge_owner_to_timeline_media.page_info.end_cursor;                
          }
        });

      }


    } catch(e) { console.log(e); }
    // return edges;

  };

  await queryInsta();
  console.log(chalk.gray(`Gathered ${edges.length} posts`));


  // Loop through posts and download liked ones

  console.log(chalk.cyan(`Downloading liked posts...`));


  for (let edge of edges) {

    await page.goto('https://www.instagram.com/p/' + edge.node.shortcode + '/', { waitUntil: 'networkidle2' });

    let liked = await page.evaluate(() => window._sharedData.entry_data.PostPage[0].graphql.shortcode_media.viewer_has_liked);

    let timestamp = await page.evaluate(() => window._sharedData.entry_data.PostPage[0].graphql.shortcode_media.taken_at_timestamp);
    let timestampInt = parseInt(timestamp);
    let datetime = moment.unix(timestampInt).utc();
    let datetimeForFilename = datetime.format('YYYYMMDD-HHmmss');
    let datetimeForLogs = datetime.format('MMMM Do YYYY (HH:mm:ss)');

    if (liked || config.all) { 

      let mediaType = await page.evaluate(() => window._sharedData.entry_data.PostPage[0].graphql.shortcode_media.__typename);
      let patternForExtension = /\.([0-9a-z]+)(?:[\?#]|$)/i;

      // Image
      if (mediaType === 'GraphImage') {
        let imageUrl = await page.evaluate(() => window._sharedData.entry_data.PostPage[0].graphql.shortcode_media.display_url);
        download(imageUrl, { directory: "./download/", filename: `${config.pr}_${datetimeForFilename}.${imageUrl.match(patternForExtension)[1]}`, timeout: 20000 }, function(err) {
          if (err) throw err
          console.log(chalk.green(`✔ Post from ${datetimeForLogs} downloaded`));
        });
      }
      // Video
      else if (mediaType === 'GraphVideo') {
        let videoUrl = await page.evaluate(() => window._sharedData.entry_data.PostPage[0].graphql.shortcode_media.video_url);
        download(videoUrl, { directory: "./download/", filename: `${config.pr}_${datetimeForFilename}.${videoUrl.match(patternForExtension)[1]}` }, function(err) {
          if (err) throw err
          console.log(chalk.green(`✔ Post from ${datetimeForLogs} downloaded`));
        });
      }
      // Image Gallery
      else if (mediaType === 'GraphSidecar') {
        let imageUrls = await page.evaluate(() => window._sharedData.entry_data.PostPage[0].graphql.shortcode_media.edge_sidecar_to_children.edges);
        let counter = 1;
        for (imageUrl of imageUrls) {
          let carItem = imageUrl.node;                                
          let carItemUrl = (carItem.is_video ? carItem.video_url : carItem.display_url);
          download(carItemUrl, { directory: "./download/", filename: `${config.pr}_${datetimeForFilename}_${counter++}.${carItemUrl.match(patternForExtension)[1]}` }, function(err) {
            if (err) throw err
            console.log(chalk.green(`✔ Post from ${datetimeForLogs} downloaded`));
          });
        }
      }


    }

    else {
      console.log(chalk.gray(`Post from ${datetimeForLogs} skipped (not liked)`));
    }

  };


  await browser.close();

  console.log(chalk.green('✔ All done. Goodbye'));

  console.timeEnd('instaload execution time');

})();
