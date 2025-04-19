require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const morgan = require('morgan');
const helmet = require('helmet');
const disk = require('diskusage');
const { lookup } = require('geoip-lite');
const iplocate = require("node-iplocate");
const { exec } = require('child_process');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const { http, https } = require('follow-redirects');
const url = require('url');

const SoundCloud = require("soundcloud-scraper");
const soundCloudClient = new SoundCloud.Client();

const NodeCache = require('node-cache');
const node_cache = new NodeCache();

disk.check('./', (err, info) => {
    const bytesToGigabytes = (bytes) => (bytes / (1024 ** 3)).toFixed(2);

    if (err)
        console.error("Error:", err);
    else {
        exec(`clear && rm -rf files/ && rm -rf json/ && mkdir -p files/ && mkdir -p json/`, (err, stdout, stderr) => {
            if (err)
                throw err;
            if (stderr)
                throw stderr;
            node_cache.set('web_apk_build', fs.readFileSync(path.join(__dirname, 'website/apk/app-release.apk')));

            const app = express();
            const port = 80;

            const limit_downloads = 40;
            const maxSize = (parseInt(bytesToGigabytes(info.available/2)) * 1000) * 1024; // 1/2 from available space in disk. (GB)
            const checkTimeSet = 5 * 1000; // Every seconds check size of disk...

            const filesDirectoryPath = './files/';
            const jsonDirectoryPath = './json/';
            let fileCache = {};
            let urlRedirectors = {};
            let signatureCache = {};

            app.FIREBASE_APPCHECK_DEBUG_TOKEN = process.env.APP_CHECK_DEBUG_TOKEN_FROM_CI;
            app.disable('x-powered-by');

            app.use(express.json());
            app.use(express.urlencoded());
            app.use(morgan('short'));
            app.use(helmet());
            app.use('/js', express.static(path.join(__dirname, 'website', 'js')));
            app.use('/json', express.static(path.join(__dirname, 'json')));
            app.use('/css', express.static(path.join(__dirname, 'website', 'css')));
            app.use('/assets', express.static(path.join(__dirname, 'website', 'assets')));

            initializeApp({ credential: cert(process.env.FIREBASE_SERVICE_ACCOUNT) });

            function proxyCheckValidRequest(req, res, next) {
                const timestamp_request = Date.now();
                try {
                    const hostname = req.header('host');
                    if (hostname.includes(`localhost`) || hostname.includes('34.71.70.153')) {
                        console.info(`${timestamp_request} - ${req.path} => [${req.method}]: [proxyCheckValidRequest] ✔️Valid User.✔️`);
                        next();
                    } else {
                        console.error(`${timestamp_request} - ${req.path} => [${req.method}]: [proxyCheckValidRequest] ⚠️Not authenticated User⚠️.`);
                        res.status(403).send(req.originalUrl.includes('/contact') ? {
                            "response": 'Forbidden',
                            "error": true
                        } : 'Forbidden');
                    }
                } catch (error) {
                    console.error(`${timestamp_request} - ${req.path} => [${req.method}]: [proxyCheckValidRequest] ⚠️Error ${error}⚠️.`);
                    res.status(403).send(req.originalUrl.includes('/contact') ? {
                        "response":'Forbidden',
                        "error": true
                    } : 'Forbidden');
                }
            }

            function proxyDownloadValidRequest(req, res, next) {
                const timestamp_request = Date.now();
                try {
                    const hostname = req.header('host');
                    if (hostname === `localhost:${port}` || hostname.includes('34.71.70.153')) {
                        console.info(`${timestamp_request} - ${req.path} => [${req.method}]: [proxyDownloadValidRequest] ✔️Valid User.✔️`);
                        next();
                    } else {
                        const authHash = req.header('authHash');
                        if (!authHash) {
                            console.error(`${timestamp_request} - ${req.path} => [${req.method}]: [proxyDownloadValidRequest] ⚠️Not authenticated User with not token hash...⚠️.`);
                            throw new Error("Non auth user.");
                        }
                        const generatedAuthHash = generateAuthHash("Hello world, the world is better with music.");
                        if (authHash === generatedAuthHash) {
                            next();
                            console.info(`${timestamp_request} - ${req.path} => [${req.method}]: [proxyDownloadValidRequest] ✔️Valid User.✔️`);
                        } else {
                            res.status(401).send({
                                "response": 'Unauthorized',
                                "error": true
                            });
                            console.error(`${timestamp_request} - ${req.path} => [${req.method}]: [proxyDownloadValidRequest] ⚠️Not authenticated User⚠️.`);
                        }
                    }
                } catch (error) {
                    console.error(`${timestamp_request} - ${req.path} => [${req.method}]: [proxyDownloadValidRequest] ⚠️Error ${error}⚠️.`);
                    res.status(401).send({
                        "response":'Unauthorized',
                        "error": true
                    });
                }
            }

            function readFileCached(filePath) {
                if (JSON.stringify(fileCache).length >= 5000000) {
                    console.log(`File cache size exceeds the limit: ${JSON.stringify(fileCache).length}. Cleaned.`);
                    fileCache = {};
                }
                // Check if the file contents are already cached
                if (fileCache[filePath]) {
                    // If cached, return the cached contents
                    return fileCache[filePath];
                } else {
                    // If not cached, read the file synchronously
                    const fileContents = fs.readFileSync(filePath, 'utf8');
                    // Cache the file contents
                    fileCache[filePath] = fileContents;
                    // Return the contents
                    return fileContents;
                }
            }

            async function checkDirectorySize() {
                try {
                    const dirSize = async (directory) => {
                        return new Promise((resolve, reject) => {
                            exec(`du -s ${directory} | cut -f1`, (error, stdout, stderr) => {
                                if (error) {
                                    reject({"response": `Error executing the command: ${error}`});
                                    return resolve(0);
                                }
                                if (stderr) {
                                    reject({"response": `Error output: ${stderr}`});
                                    return resolve(0);
                                }
                                resolve(parseInt(stdout.split("\n")[0]));
                            })
                        });
                    }
                    let totalSize = await dirSize(filesDirectoryPath);
                    if (totalSize >= maxSize) {
                        console.log(`Directory size exceeds the limit: ${totalSize} Bytes. Deleting files...`);
                        await fs.promises.rm(filesDirectoryPath, { recursive: true, force: true });
                        console.log("Directory deleted.");
                        // Also delete content of json directory.
                        await fs.promises.rm(jsonDirectoryPath, { recursive: true, force: true });
                        fileCache = {};
                        console.log("Json directory content deleted.");
                        exec(`mkdir -p files/ && mkdir -p json/`);
                    }
                } catch (err) {
                    console.error("Error occurred:", err);
                }
            }

            function generateAuthHash(inputString) {
                try {
                    if (JSON.stringify(signatureCache).length >= 5000000) {
                        console.log(`Signature cache size exceeds the limit: ${JSON.stringify(signatureCache).length}. Cleaned.`);
                        signatureCache = {};
                    }
                    // Variables...
                    const currentDate = new Date();
                    const year = parseInt(currentDate.getFullYear().toString().split("").map((str, index) => { if (index === 0 || index === 1) return null; else return str; }).filter(value => value != null).join(""));
                    const formatDateKey = `${year}`;
                    inputString += formatDateKey;
                    // Verify to return...
                    if (signatureCache[formatDateKey])
                        return signatureCache[formatDateKey];
                    // Convert input string to ASCII characters
                    let asciiChars = [];
                    for (let i = 0; i < inputString.length; i++)
                        asciiChars.push(inputString.charCodeAt(i));
                    // Modify ASCII values based on the given pattern
                    for (let i = 0; i < asciiChars.length; i++)
                        asciiChars[i] += (i % 2 === 0 ? (year/2)+1 : year+1);
                    // Convert modified ASCII values back to characters
                    let modifiedString = "";
                    for (let i = 0; i < asciiChars.length; i++) {
                        let charCode = String.fromCharCode(asciiChars[i]);
                        modifiedString += (charCode.length === 1 && charCode.match(/[a-z]/i)) ? charCode : "";
                    }
                    // Generate hash from the modified string using month, and year as seed
                    let hashed = 0;
                    for (let i = 0; i < modifiedString.length; i++) {
                        hashed = (hashed << 5) + hashed + modifiedString.charCodeAt(i) + year;
                        hashed = hashed & hashed; // Convert to 32bit integer
                        hashed = Math.abs(hashed); // Make sure it's positive
                    }
                    const hash = require('crypto').createHash('sha1');
                    const generatedHashed = `${modifiedString}_${hashed}_mftechnologydevelopment`;
                    hash.update(generatedHashed);
                    signatureCache[formatDateKey] = hash.digest('hex');
                    return signatureCache[formatDateKey];
                } catch (exception) {
                    console.error(exception);
                    return "unknown_token_server";
                }
            }

            const getSoundCloudInfo = (soundcloud_url, file_info) => {
                return new Promise((resolve, _) => {
                    soundCloudClient.getPlaylist(soundcloud_url)
                        .then(playlistInfo => {
                            if (playlistInfo["thumbnail"] === undefined || playlistInfo["thumbnail"] === null)
                                playlistInfo["thumbnail"] = playlistInfo["tracks"][0]["thumbnail"];
                            delete playlistInfo["tracks"];
                            playlistInfo["thumbnail"] = playlistInfo["thumbnail"].replace("-large", "-t500x500");
                            resolve({
                                "isPlaylist": true,
                                "info": playlistInfo
                            });
                        })
                        .catch(() =>
                            soundCloudClient.getSongInfo(soundcloud_url)
                                .then(songInfo => {
                                    let new_songInfo = JSON.parse(JSON.stringify(songInfo))
                                    new_songInfo.trackCount = file_info.length;
                                    resolve({
                                        "isPlaylist": false,
                                        "info": new_songInfo
                                    });
                                })
                                .catch(() => {
                                    try {
                                        resolve({
                                            "isPlaylist": false,
                                            "info": {
                                                title: file_info.length === 1 ? file_info[0]["title"] : file_info[0]["playlist_title"],
                                                thumbnail: file_info[0]["thumbnail"],
                                                trackCount: file_info.length
                                            }
                                        });
                                    } catch(error) {
                                        console.error(file_info);
                                        _(error);
                                    }
                                })
                        );
                });
            }

            function getFinalUrl(inputUrl) {
                return new Promise((resolve, reject) => {
                    if (inputUrl.startsWith('https://api-v2.soundcloud.com/'))
                        return resolve(inputUrl);
                    const parsedUrl = url.parse(inputUrl);
                    const protocol = parsedUrl.protocol === 'https:' ? https : http;
                    const request = protocol.get(inputUrl, (response) => {
                        // The response object will contain the final URL
                        resolve(response.responseUrl);
                    });
                    request.on('error', (err) => {
                        reject(err);
                    });
                });
            }

            app.get('/', proxyCheckValidRequest, (req, res) => {
                res.sendFile(path.join(__dirname, 'website/index.html'));
            });

            app.get('/sounglouddownloader', proxyCheckValidRequest, (req, res) => {
                const cachedApkFile = node_cache.get('web_apk_build');
                if (cachedApkFile) {
                    res.writeHead(200, {
                        'Content-Type': 'application/vnd.android.package-archive',
                        'Content-Length': cachedApkFile.length
                    });
                    res.end(cachedApkFile);
                } else res.redirect('/404');
            });

            app.get('/terms', proxyCheckValidRequest, (req, res) => {
                res.status(200).sendFile(path.join(__dirname, 'website/terms.html'));
            });

            app.get('/privacy_policy', proxyCheckValidRequest, (req, res) => {
                res.status(200).sendFile(path.join(__dirname, 'website/privacypolicy.html'));
            });

            app.post('/contact', proxyCheckValidRequest, (req, res) => {
                try {
                    const { email, name, context } = req.body;
                    if (email === undefined || name === undefined || context === undefined || email === null || name === null || context === null || !email || !name || !context)
                        throw new Error("Invalid data form.");
                    else {
                        const ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress);
                        iplocate(ip).then(async (ip_results) => {
                            await getFirestore().collection('contact').doc(email).collection(name).doc(new Date().toString()).set(({
                                "context": context,
                                "date": new Date(),
                                "ip": ip,
                                "ip_metadata": ip_results,
                                "location": lookup(ip)
                            }));
                            res.status(200).send({
                                "response": "Received!",
                                "error": false
                            });
                        });
                    }
                } catch (error) {
                    console.error(`An exception an ocurred in contact section: ${error}`);
                    res.status(200).send({
                        "response": "Invalid request!",
                        "error": true
                    });
                }
            });

            app.post('/download', proxyDownloadValidRequest, async (req, res) => {
                let file_name = "";
                let file_path = "";
                // URL Parsing.
                let { url } = req.query;
                const copyOriginalUrl = url;
                const timestamp_request = Date.now();
                try {
                    // Validation URL.
                    if (!url || `${url}`.replace(/\s/g, '').length <= 1 || !(url.startsWith('https://soundcloud.com/') || url.startsWith('https://on.soundcloud.com/') || url.startsWith('https://api-v2.soundcloud.com/')))
                        return res.status(400).send({
                            "response": "Check your SoundCloud URL.",
                            "error": true
                        });
                    else if (`${url}`.includes("/discover/sets/personalized-tracks"))
                        return res.status(400).send({
                            "response": "It is not possible to download this type of playlist because SoundCloud does not allow public downloading.",
                            "error": true
                        });

                    console.log(`${timestamp_request} - ${req.path} => [${req.method}]: Starting download request...`);

                    // If exists send.
                    if (urlRedirectors[copyOriginalUrl]){
                        console.log(`${timestamp_request} - ${req.path} => [${req.method}]: Redirected request...`);
                        let file_path = urlRedirectors[copyOriginalUrl].filePath;
                        // If created file is more active than 5 minutes, delete...
                        if ((new Date().getTime() - new Date(fs.statSync(file_path).birthtime).getTime()) > (5 * 60 * 1000)) {
                            fs.unlinkSync(file_path);
                            delete fileCache[file_path];
                        } else {
                            res.set({
                                'Cache-Control': `public, max-age=300`,
                                'Expires': new Date(Date.now() + 86400 * 1000).toUTCString()
                            });
                            return res.status(200).send(JSON.parse(readFileCached(file_path)));
                        }
                    }

                    console.log(`${timestamp_request} - ${req.path} => [${req.method}]: Starting download original url...`);
                    getFinalUrl(url)
                        .then(finalUrl => {
                            console.log(`${timestamp_request} - ${req.path} => [${req.method}]: Fetched original url: ${finalUrl}`);
                            // URL Parsing.
                            url = finalUrl;
                            url = url.includes("?") ? url.split("?")[0] : url;

                            // Create filename.
                            file_name = `${btoa(url).replace(/\W/g, "")}`;
                            file_path = `json/${file_name}.json`;

                            // Create directory...
                            exec(`mkdir -p files/${file_name}/`, () => {
                                console.log(`${timestamp_request} - ${req.path} => [${req.method}]: Created directory...`);
                                // Finish step...
                                const finishedDownload = () => {
                                    console.log(`${timestamp_request} - ${req.path} => [${req.method}]: Final step running...`);
                                    exec(`./rename_mp3_files files/${file_name}/ && cd files/${file_name}/ && find . -type f -name "*.mp3" -print0 | head -z -n ${limit_downloads} | xargs -0 zip -r  ${file_name}.zip`, (error, _o, stderr) => {
                                        if ((error || stderr) && file_name !== "") {
                                            delete fileCache[file_path];
                                            exec(`rm -rf files/${file_name}/ && rm -rf json/${file_name}.json`);
                                        }
                                        if (error) {
                                            console.error(`${timestamp_request} - ${req.path} => [${req.method}]: Error executing the command: ${error}`);
                                            return res.status(500).send({
                                                "response": 'Try again later or check your SoundCloud URL.',
                                                "error": true
                                            });
                                        }
                                        if (stderr) {
                                            console.error(`${timestamp_request} - ${req.path} => [${req.method}]: Error output: ${stderr}`);
                                            return res.status(500).send({
                                                "response": 'Try again later or try with another SoundCloud URL.',
                                                "error": true
                                            });
                                        }

                                        console.log(`${timestamp_request} - ${req.path} => [${req.method}]: Final step parsing...`);

                                        // Read file and parsing.
                                        let stdout = JSON.parse(readFileCached(file_path));

                                        // Delete created mp3 files.
                                        fs.readdir(`files/${file_name}/`, (err, files) => {
                                            if (err)
                                                return console.error(`${timestamp_request} - ${req.path} => [${req.method}]: Error reading directory:`, err);
                                            // Deleting files
                                            files.forEach(file => {
                                                if (file.endsWith('.mp3') || file.endsWith('.jpg'))
                                                    fs.unlink(path.join(`files/${file_name}/`, file), () => {});
                                            });
                                            try {
                                                // Modify response...
                                                stdout = {
                                                    "response": {
                                                        metadata: {
                                                            info: {
                                                                isPlaylist: Object.keys(stdout).indexOf("trackCount") !== -1,
                                                                title: stdout['title'],
                                                                trackCount: Object.keys(stdout).indexOf("trackCount") !== -1 ? stdout['trackCount'] : 1,
                                                                thumbnail: stdout['thumbnail'] !== null && stdout['thumbnail'] !== undefined ? stdout['thumbnail'].replace("-t500x500", "-original") : (Object.keys(stdout).indexOf("trackCount") !== -1 && stdout['tracks'].filter((track) => track.thumbnail !== null && track.thumbnail !== undefined).length >= 1 ? stdout['tracks'].filter((track) => track.thumbnail !== null && track.thumbnail !== undefined)[0]['thumbnail'].replace("-large", "-original") : "http://a1.sndcdn.com/images/fb_placeholder.png")
                                                            }
                                                        },
                                                        file_name: `${req.protocol}://${req.hostname}:2000/${file_name}/${file_name}.zip`,
                                                        file_info: stdout
                                                    },
                                                    "error": false
                                                };
                                                res.status(200).send(stdout);
                                                // Save...
                                                fs.writeFileSync(file_path, JSON.stringify(stdout), 'utf8');
                                                delete fileCache[file_path];
                                                urlRedirectors[copyOriginalUrl] = {
                                                    parsedUrl: finalUrl,
                                                    filePath: file_path
                                                }
                                                console.log(`${timestamp_request} - ${req.path} => [${req.method}]: Delivered!`);
                                            } catch (err) {
                                                console.error(`${timestamp_request} - ${req.path} => [${req.method}]: Error`, err);
                                            }
                                        });
                                    });
                                }

                                // Return resolve with obj infoPlayListJSON or manage request with not works...
                                const processPlaylist = (url_playlist, limit_downloads_process) => {
                                    return new Promise((resolvePlaylist, _) => {
                                        soundCloudClient.getPlaylist(url_playlist)
                                            .then(playlistInfo => {
                                                console.log(`${timestamp_request} - ${req.path} => [${req.method}]: Downloaded playlist info...`);
                                                playlistInfo['tracks'] = [];
                                                playlistInfo['tracks_getted'] = [];

                                                if (limit_downloads_process <= 0) {
                                                    resolvePlaylist(playlistInfo);
                                                    return console.log(`${timestamp_request} - ${req.path} => [${req.method}]: Limited downloads to zero...`);
                                                }

                                                exec(`yt-dlp --simulate --ignore-errors --quiet --skip-download --flat-playlist --print-json --no-progress -N 50 --playlist-end ${limit_downloads_process} ${url_playlist}`, (error, stdout, stderr) => {
                                                    stdout = stdout.replaceAll("\n", ",");
                                                    stdout = stdout.slice(0, stdout.length-1);
                                                    stdout = `{"response":[${stdout}]}`;
                                                    playlistInfo['tracks'] = JSON.parse(stdout)["response"];

                                                    if ((error || stderr) && file_name !== "") {
                                                        delete fileCache[file_path];
                                                        exec(`rm -rf files/${file_name}/ && rm -rf json/${file_name}.json`);
                                                    }
                                                    if (error) {
                                                        console.error(`${timestamp_request} - ${req.path} => [${req.method}]: Error executing the command: ${error}`);
                                                        return res.status(500).send({
                                                            "response": 'Try again later or check your SoundCloud URL.',
                                                            "error": true
                                                        });
                                                    }
                                                    if (stderr) {
                                                        console.error(`${timestamp_request} - ${req.path} => [${req.method}]: Error output: ${stderr}`);
                                                        return res.status(500).send({
                                                            "response": 'Try again later or try with another SoundCloud URL.',
                                                            "error": true
                                                        });
                                                    }

                                                    // Modify trackCount...
                                                    playlistInfo['trackCount'] = (playlistInfo['tracks'].length > limit_downloads_process) ? limit_downloads_process : playlistInfo['tracks'].length;
                                                    // Only urls from playlistinfo...
                                                    let downloadQueue = playlistInfo.tracks.map((trackInfo) => trackInfo.url);
                                                    // If is more than limit, split...
                                                    if (downloadQueue.length > limit_downloads_process)
                                                        downloadQueue = downloadQueue.slice(0, limit_downloads_process);

                                                    let MAX_THREADS = 7;
                                                    let activeThreads = 0;

                                                    // Fix max threads...
                                                    MAX_THREADS = MAX_THREADS > playlistInfo['trackCount'] ? playlistInfo['trackCount'] : MAX_THREADS;

                                                    function downloadFile(url, processID, songID) {
                                                        return new Promise((resolve, reject) => {
                                                            try {
                                                                exec(`cd files/${file_name}/ && yt-dlp --downloader aria2c --downloader-args aria2c:'-c -j 50 -x 20 -s 50 -k 50M --optimize-concurrent-downloads=true --http-accept-gzip=true' --no-progress --embed-thumbnail -f "mp3" -o "%(title)s.%(ext)s" --no-overwrite --no-abort-on-error --ignore-errors --ignore-no-formats-error --continue --newline --min-sleep-interval 0 --max-sleep-interval 0 ${url}`, (error, stdout, stderr) => {
                                                                    if (error || stderr)
                                                                        console.error(`${timestamp_request} - ${req.path} => [${req.method}]: Process ${processID}: Error downloading: ${url} => ${error} ${stderr}`);
                                                                    if (error)
                                                                        return reject(error);
                                                                    if (stderr)
                                                                        return reject(stderr);
                                                                    console.log(`${timestamp_request} - ${req.path} => [${req.method}]: Process ${processID}: ${songID} Downloaded: ${url}`);
                                                                    if (url.startsWith('https://api-v2.soundcloud.com/'))
                                                                        resolve()
                                                                    else
                                                                        soundCloudClient.getSongInfo(url)
                                                                            .then(songInfo => {
                                                                                playlistInfo['tracks_getted'].push(songInfo);
                                                                            })
                                                                            .catch(error => console.error(`${timestamp_request} - ${req.path} => [${req.method}]: Process ${processID}: ${songID} Error downloading data song: ${url}`))
                                                                            .finally(() => resolve());
                                                                });
                                                            } catch (err) {
                                                                reject(err);
                                                            }
                                                        });
                                                    }

                                                    function processQueue(processID) {
                                                        if (downloadQueue.length > 0 && activeThreads < MAX_THREADS) {
                                                            const url = downloadQueue.shift();
                                                            if (url) {
                                                                activeThreads++;
                                                                downloadFile(url, processID, downloadQueue.length+1).finally(() => {
                                                                    activeThreads--;
                                                                    processQueue(processID);
                                                                });
                                                            }
                                                        }
                                                        if (downloadQueue.length === 0 && activeThreads === 0) {
                                                            if (playlistInfo['tracks_getted'].length >= 1)
                                                                playlistInfo['thumbnail'] = playlistInfo['tracks_getted'].reverse()[0]['thumbnail'];
                                                            resolvePlaylist(playlistInfo);
                                                        }
                                                    }

                                                    console.log(`${timestamp_request} - ${req.path} => [${req.method}]: Downloaded playlist metadata and started ${MAX_THREADS} download process (${downloadQueue.length})...`);

                                                    // Start queue...
                                                    for (let i = 0; i < MAX_THREADS; i++)
                                                        processQueue(i);
                                                });
                                            })
                                            .catch((error) => {
                                                delete fileCache[file_path];
                                                exec(`rm -rf files/${file_name}/ && rm -rf json/${file_name}.json`);
                                                console.error(`${timestamp_request} - ${req.path} => [${req.method}]: Error output: ${error}`);
                                                res.status(500).send({
                                                    "response": 'Try again later or try with another SoundCloud URL.',
                                                    "error": true
                                                });
                                            });
                                    });
                                }

                                // Download.
                                if (url.includes("/sets/")){
                                    // Download playlist...
                                    console.log(`${timestamp_request} - ${req.path} => [${req.method}]: Downloading playlist...`);
                                    processPlaylist(url, limit_downloads).then((playlistInfo) => {
                                        fs.writeFileSync(file_path, JSON.stringify(playlistInfo), 'utf8');
                                        finishedDownload();
                                    });
                                } else {
                                    console.log(`${timestamp_request} - ${req.path} => [${req.method}]: Downloading song...`);
                                    const process_non_api_url = () => {
                                        soundCloudClient.getSongInfo(url)
                                            .then(async (songInfo) => {
                                                fs.writeFileSync(file_path, JSON.stringify(songInfo), 'utf8');
                                                const stream = await songInfo.downloadProgressive();
                                                const writer = stream.pipe(fs.createWriteStream(`files/${file_name}/${songInfo.title.replaceAll("/", "")}.mp3`));
                                                writer.on("finish", finishedDownload);
                                            })
                                            .catch(_2 => {
                                                console.log(`${timestamp_request} - ${req.path} => [${req.method}]: Downloading user songs...`);
                                                exec(`yt-dlp --simulate --ignore-errors --flat-playlist --skip-download --print-json --no-progress -N 50 ${url}`, (error, stdout, stderr) => {
                                                    if ((error || stderr) && file_name !== "") {
                                                        delete fileCache[file_path];
                                                        exec(`rm -rf files/${file_name}/ && rm -rf json/${file_name}.json`);
                                                    }
                                                    if (error) {
                                                        console.error(`${timestamp_request} - ${req.path} => [${req.method}]: Error executing the command: ${error}`);
                                                        return res.status(500).send({
                                                            "response": 'Try again later or check your SoundCloud URL.',
                                                            "error": true
                                                        });
                                                    }
                                                    if (stderr) {
                                                        console.error(`${timestamp_request} - ${req.path} => [${req.method}]: Error output: ${stderr}`);
                                                        return res.status(500).send({
                                                            "response": 'Try again later or try with another SoundCloud URL.',
                                                            "error": true
                                                        });
                                                    }

                                                    stdout = stdout.replaceAll("\n", ",");
                                                    stdout = stdout.slice(0, stdout.length-1);
                                                    stdout = `{"response":[${stdout}]}`;
                                                    stdout = JSON.parse(stdout)["response"];
                                                    stdout = stdout.map((playlist) => playlist.original_url);

                                                    let playlists = [];
                                                    let tracks = [];
                                                    let tracks_getted = [];
                                                    let limiter_downloads_remain = limit_downloads;

                                                    function downloadPlaylist() {
                                                        if (stdout.length >= 1)
                                                            processPlaylist(stdout.shift(), limiter_downloads_remain).then((playlistInfo) => {
                                                                limiter_downloads_remain -= playlistInfo['tracks'].length;
                                                                playlists.push(playlistInfo);
                                                                playlistInfo['tracks'].forEach(track => tracks.push(track));
                                                                playlistInfo['tracks_getted'].forEach(track => tracks_getted.push(track));
                                                                downloadPlaylist();
                                                            });
                                                        else {
                                                            if (tracks.length > limit_downloads)
                                                                tracks = tracks.slice(0, limit_downloads);

                                                            let author_playlist = url.split('/');
                                                            author_playlist = [author_playlist.length-1];
                                                            author_playlist = playlists.length >= 1 ? playlists[0]['author'].name : author_playlist;

                                                            fs.writeFileSync(file_path, JSON.stringify({
                                                                "id": null,
                                                                "title": `${author_playlist} (All)`,
                                                                "url": url,
                                                                "description": `Listen ${author_playlist} on #SoundCloud`,
                                                                "thumbnail": tracks_getted.length >= 1 ? tracks_getted.reverse()[0]['thumbnail'] : null,
                                                                "author": author_playlist,
                                                                "embedURL": `https://soundcloud.com/oembed?url=${url}&format=json`,
                                                                "embed": null,
                                                                "genre": null,
                                                                "trackCount": tracks.length,
                                                                "tracks": tracks,
                                                                "tracks_getted": tracks_getted
                                                            }), 'utf-8');
                                                            finishedDownload();
                                                        }
                                                    }

                                                    downloadPlaylist();
                                                });
                                            });
                                    }

                                    if (url.startsWith('https://api-v2.soundcloud.com/'))
                                        try {
                                            exec(`cd files/${file_name}/ && yt-dlp --downloader aria2c --downloader-args aria2c:'-c -j 50 -x 20 -s 50 -k 50M --optimize-concurrent-downloads=true --http-accept-gzip=true' --no-progress --embed-thumbnail -f "mp3" -o "%(title)s.%(ext)s" --print-json --no-overwrite --no-abort-on-error --ignore-errors --ignore-no-formats-error --continue --newline --min-sleep-interval 0 --max-sleep-interval 0 ${url} > ../../${file_path}`, (error, stdout, stderr) => {
                                                if (error || stderr) {
                                                    console.error(`${timestamp_request} - ${req.path} => [${req.method}]: Error found => ${url} => ${error} ${stderr}`);
                                                    return res.status(500).send({
                                                        "response": 'Not found URL!',
                                                        "error": true
                                                    });
                                                }
                                                console.log(`${timestamp_request} - ${req.path} => [${req.method}]: Downloaded: ${url}`);
                                                finishedDownload();
                                            });
                                        } catch (error) {
                                            process_non_api_url();
                                        }
                                    else
                                        process_non_api_url();
                                }
                            });
                        })
                        .catch(error => {
                            if (file_name !== "") {
                                delete fileCache[file_path];
                                exec(`rm -rf files/${file_name}/ && rm -rf json/${file_name}.json`)
                            }
                            console.error(`${timestamp_request} - ${req.path} => [${req.method}]: Internal Server Error ${error}`);
                            res.status(500).send({
                                "response": 'Unknown error. Try again.',
                                "error": true
                            });
                        });
                } catch (error) {
                    if (file_name !== "") {
                        delete fileCache[file_path];
                        exec(`rm -rf files/${file_name}/ && rm -rf json/${file_name}.json`)
                    }
                    console.error(`${timestamp_request} - ${req.path} => [${req.method}]: Internal Server Error ${error}`);
                    res.status(500).send({
                        "response": 'Unknown error. Try again.',
                        "error": true
                    });
                }
            });

            app.post('/metadata', proxyDownloadValidRequest, async (req, res) => {
                const timestamp_request = Date.now();
                try{
                    const { url } = req.query;
                    exec(`yt-dlp --simulate --ignore-errors --quiet --skip-download --flat-playlist --print-json --no-progress -N 50 --playlist-end ${limit_downloads} ${url}`, (error, stdout, stderr) => {
                        if (error || stderr) {
                            console.error(`${timestamp_request} - ${req.path} => [${req.method}]: ⚠️Error found in metadata route⚠️ => ${url}`);
                            return res.status(500).send({
                                "response": 'Not found URL!',
                                "error": true
                            });
                        }
                        console.log(`${timestamp_request} - ${req.path} => [${req.method}]: Sending metadata from URL => ${url}`);
                        stdout = parseStdout(stdout).slice(0, limit_downloads);

                        function parseStdout(to_parse_stdout) {
                            to_parse_stdout = to_parse_stdout.split('\n').join(',');
                            to_parse_stdout = to_parse_stdout.slice(0, to_parse_stdout.length-1);
                            to_parse_stdout = `{"response": [${to_parse_stdout}]}`;
                            to_parse_stdout = JSON.parse(to_parse_stdout)["response"];
                            return to_parse_stdout.map((object_sc) => object_sc["original_url"]);
                        }

                        function sendResponse(parsed_stdout) {
                            res.status(200).send({
                                "response": parsed_stdout,
                                "error": false
                            });
                        }

                        let iterationSet = 0;
                        let copy_stdout = [];
                        function loopSets() {
                            if (iterationSet == stdout.length)
                                sendResponse(copy_stdout.flat().slice(0, limit_downloads));
                            else
                                exec(`yt-dlp --simulate --ignore-errors --quiet --skip-download --flat-playlist --print-json --no-progress -N 50 --playlist-end ${limit_downloads} ${stdout[iterationSet]}`, (error, stdout, stderr) => {
                                    if (error || stderr) {
                                        console.error(`${timestamp_request} - ${req.path} => [${req.method}]: ⚠️Error found in metadata route⚠️ => ${stdout[iterationSet]}`);
                                        return sendResponse(stdout);
                                    }
                                    stdout = parseStdout(stdout);
                                    copy_stdout.push(stdout);
                                    iterationSet += 1;
                                    loopSets();
                                });
                        }

                        if (!stdout.map(url_soundcloud => url_soundcloud.includes('/sets/')))
                            sendResponse(stdout);
                        else
                            loopSets();
                    });
                } catch (error) {
                    console.error(`${timestamp_request} - ${req.path} => [${req.method}]: Internal Server Error ${error}`);
                    res.status(500).send({
                        "response": 'Unknown error. Provide a valid SoundCloud URL!',
                        "error": true
                    });
                }
            });

            // 404 error.
            app.use(proxyCheckValidRequest, (req, res) => {
                res.setHeader('Cache-Control', 'public, max-age=86400000');
                res.status(404).sendFile(path.join(__dirname, 'website/404.html'));
            });

            // Handling 500 Internal Server Error or any other unhandled errors...
            app.use(proxyCheckValidRequest, (err, req, res) => {
                console.error(err.stack);
                res.setHeader('Cache-Control', 'public, max-age=86400000');
                res.status(404).sendFile(path.join(__dirname, 'website/404.html'));
            });

            app.listen(port, async () => {
                await checkDirectorySize();
                setInterval(checkDirectorySize, checkTimeSet);
                console.log(`Server is listening on ${port}.`);
            });
        });
    }
});