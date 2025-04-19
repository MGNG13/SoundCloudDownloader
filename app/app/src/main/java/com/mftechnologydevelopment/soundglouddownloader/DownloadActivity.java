package com.mftechnologydevelopment.soundglouddownloader;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.AsyncTask;
import android.os.Build;
import android.os.Bundle;
import android.os.CountDownTimer;
import android.os.Environment;
import android.util.Log;
import android.view.View;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.bumptech.glide.Glide;
import com.bumptech.glide.load.engine.DiskCacheStrategy;
import com.bumptech.glide.load.resource.drawable.DrawableTransitionOptions;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.firebase.analytics.FirebaseAnalytics;
import com.google.firebase.crashlytics.FirebaseCrashlytics;
import com.huxq17.download.Pump;
import com.huxq17.download.core.DownloadInfo;
import com.huxq17.download.core.DownloadListener;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Calendar;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import okhttp3.CacheControl;
import okhttp3.Request;

@SuppressWarnings("deprecation")
@SuppressLint("SetTextI18n")
public class DownloadActivity extends AppCompatActivity {
    public static class DecompressFast {
        protected final String _zipFile;
        protected final String _location;

        public DecompressFast(String zipFile, String location) {
            _zipFile = zipFile;
            _location = location;
            _dirChecker("");
        }

        public void unzip() {
            try  {
                FileInputStream fin = new FileInputStream(_zipFile);
                ZipInputStream zin = new ZipInputStream(fin);
                ZipEntry ze;
                while ((ze = zin.getNextEntry()) != null) {
                    if(ze.isDirectory())
                        _dirChecker(ze.getName());
                    else {
                        FileOutputStream fout = new FileOutputStream(_location + ze.getName());
                        BufferedOutputStream bufout = new BufferedOutputStream(fout);
                        byte[] buffer = new byte[1024];
                        int read;
                        while ((read = zin.read(buffer)) != -1)
                            bufout.write(buffer, 0, read);
                        bufout.close();
                        zin.closeEntry();
                        fout.close();
                    }
                }
                zin.close();
            } catch(Exception ignored) {}
        }

        @SuppressWarnings("all")
        protected void _dirChecker(String dir) {
            File f = new File(_location + dir);
            if(!f.isDirectory())
                f.mkdirs();
        }
    }

    protected static String[] stringsArray = {
            "aHR0cDovLzM0LjcxLjcwLjE1Mw==",
            "TG9hZGluZyBhZC4uLg==",
            "RG93bmxvYWRpbmc=",
            "U291bmRHbG91ZERvd25sb2FkZXIv",
            "QWQgd2FzIGNsaWNrZWQu",
            "QWQgZmFpbGVkIHRvIHNob3cgZnVsbHNjcmVlbiBjb250ZW50Lg==",
            "QWQgcmVjb3JkZWQgYW4gaW1wcmVzc2lvbi4=",
            "QWQgc2hvd2VkIGZ1bGxzY3JlZW4gY29udGVudC4=",
            "QWQgZGlzbWlzc2VkIGZ1bGxzY3JlZW4gY29udGVudC4=",
            "RG93bmxvYWQgQ29tcGxldGVkIQ==",
            "RG93bmxvYWQgRmFpbGVkLiBUcnkgYWdhaW4gaW4gNSBtaW51dGVzLg==",
            "RG93bmxvYWQgcGF1c2VkIQ==",
            "RG93bmxvYWQgcGVuZGluZyE=",
            "RG93bmxvYWQgaW4gcHJvZ3Jlc3Mh",
            "RG93bmxvYWQgaXMgbm93aGVyZSBpbiBzaWdodCE=",
            "RmFpbGVkIHRvIGV4dHJhY3QgaW5mb3JtYXRpb24gZnJvbSBVUkwu",
            "RmFpbGVkIHRvIGRvd25sb2FkIG1ldGFkYXRhIGZyb20gVVJMOiA=",
            "SGVsbG8gd29ybGQsIHRoZSB3b3JsZCBpcyBiZXR0ZXIgd2l0aCBtdXNpYy4=",
            "X21mdGVjaG5vbG9neWRldmVsb3BtZW50",
            "RG93bmxhZA==",
            "Y2EtYXBwLXB1Yi0zOTQwMjU2MDk5OTQyNTQ0LzUyMjQzNTQ5MTc="
    };

    // Constants
    protected static final String API_ROUTE = deobfuscate(stringsArray[0]);
    protected static int rewardedAdIntentsMax = 6;

    // Views
    protected LinearLayout download_song_button_download;
    protected EditText download_song_pasteurl_download;
    protected TextView download_song_textview_button_download;
    protected ImageView download_song_image_imageView;
    protected TextView download_song_song_textView;
    protected TextView download_song_sounds_textView;
    protected ProgressBar download_song_progressbar_progress;
    protected LinearLayout download_song_linearlayout_account;

    // Rewarded Ad
    protected RewardedAd rewardedAd = null;
    protected int rewardedAdIntents = 0;

    // Other variables
    protected static JSONObject signatureCache = new JSONObject();
    protected FirebaseAnalytics mFirebaseAnalytics;

    @Override
    protected void onStart() {
        super.onStart();
        loadRewardedAd(null);
        requestPermissionsStorage();
        // Delete all cached files...
        for (File file : getAllFiles())
            deleteFile(file.getAbsolutePath());
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_download);
        getWindow().setNavigationBarColor(getColor(R.color.black));

        initializeViews();
        setClickListeners();
        mFirebaseAnalytics = FirebaseAnalytics.getInstance(this);

        Intent intent = getIntent();
        String action = intent.getAction();
        String type = intent.getType();
        Uri data = intent.getData();

        if (Intent.ACTION_VIEW.equals(action) && data != null) {
            String parsed_data = data.toString();
            if (!parsed_data.isEmpty() && isValidSoundCloudURL(parsed_data)) {
                download_song_pasteurl_download.setText(parsed_data);
                download_song_button_download.callOnClick();
            }
        } else if (Intent.ACTION_SEND.equals(action) && type != null) {
            if ("text/plain".equals(type)){
                String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
                if (sharedText != null)
                    if (isValidSoundCloudURL(sharedText)){
                        download_song_pasteurl_download.setText(sharedText);
                        download_song_button_download.callOnClick();
                    } else
                        Toast.makeText(this, "Not valid SoundCloud Link!", Toast.LENGTH_SHORT).show();
            } else
                Toast.makeText(this, "Not valid SoundCloud Link!", Toast.LENGTH_SHORT).show();
        }
    }

    protected boolean isValidSoundCloudURL(String url) {
        return (url.startsWith("https://soundcloud.com/") || url.startsWith("https://on.soundcloud.com/") || url.startsWith("https://api-v2.soundcloud.com/"));
    }

    protected void initializeViews() {
        download_song_button_download = findViewById(R.id.download_song_button_download);
        download_song_pasteurl_download = findViewById(R.id.download_song_pasteurl_download);
        download_song_textview_button_download = findViewById(R.id.download_song_textview_button_download);
        download_song_image_imageView = findViewById(R.id.download_song_image_imageView);
        download_song_song_textView = findViewById(R.id.download_song_song_textView);
        download_song_sounds_textView = findViewById(R.id.download_song_sounds_textView);
        download_song_progressbar_progress = findViewById(R.id.download_song_progressbar_progress);
        download_song_linearlayout_account = findViewById(R.id.download_song_linearlayout_account);
    }

    protected void setClickListeners() {
        download_song_linearlayout_account.setOnClickListener(v -> startActivity(new Intent(this, AccountActivity.class)));
        download_song_button_download.setOnClickListener(v -> {
            download_song_progressbar_progress.setVisibility(View.VISIBLE);
            String url = download_song_pasteurl_download.getText().toString();
            if (url.replaceAll(" ", "").isEmpty()) {
                Toast.makeText(DownloadActivity.this, "", Toast.LENGTH_SHORT).show();
                resetDownloadButton();
            } else
                initiateDownload(url);
        });
    }

    protected void initiateDownload(String url) {
        download_song_textview_button_download.setText(deobfuscate(stringsArray[1]));
        download_song_button_download.setClickable(false);
        download_song_button_download.setEnabled(false);
        if (rewardedAd == null) {
            loadRewardedAd(null);
            new CountDownTimer(500, 200) {
                @Override
                public void onTick(long millisUntilFinished) {}

                @Override
                public void onFinish() {
                    initiateDownload(url);
                }
            }.start();
        } else {
            rewardedAd.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override
                public void onAdClicked() {
                    Log.d(getString(R.string.app_name), deobfuscate(stringsArray[1]));
                }

                @Override
                public void onAdFailedToShowFullScreenContent(@NonNull AdError adError) {
                    Log.d(getString(R.string.app_name), deobfuscate(stringsArray[5]));
                    rewardedAd = null;
                    loadRewardedAd(null);
                }

                @Override
                public void onAdImpression() {
                    Log.d(getString(R.string.app_name), deobfuscate(stringsArray[6]));
                }

                @Override
                public void onAdShowedFullScreenContent() {
                    Log.d(getString(R.string.app_name), deobfuscate(stringsArray[7]));
                }

                @Override
                public void onAdDismissedFullScreenContent() {
                    Log.d(getString(R.string.app_name), deobfuscate(stringsArray[8]));
                    rewardedAd = null;
                    download_song_textview_button_download.setText(deobfuscate(stringsArray[2]) + "...");
                    download_song_progressbar_progress.setIndeterminate(true);
                    downloadFromAPI(url);
                }
            });
            rewardedAd.show(DownloadActivity.this, (rewardItem) -> {});
        }
    }

    protected interface DownloadSongListener {
        void onSuccess(String message_success);
        void onFailure(String error);
    }

    protected class downloadSongURL implements Runnable {
        private final String soundCloudUrl;
        private final DownloadSongListener listener;

        protected downloadSongURL(String soundCloudUrl, DownloadSongListener listener) {
            this.soundCloudUrl = soundCloudUrl;
            this.listener = listener;
        }

        @Override
        public void run() {
            String soundCloudUrl = this.soundCloudUrl;
            new APISoundCloudDownloader(new APISoundCloudDownloadListener() {
                @SuppressLint("UnspecifiedRegisterReceiverFlag")
                @Override
                public void onAPISoundCloudDownloaded(JSONObject jsonObject) {
                    try {
                        Bundle bundle = new Bundle();
                        bundle.putString(FirebaseAnalytics.Param.ITEM_ID, soundCloudUrl);
                        bundle.putBoolean("error", jsonObject.getBoolean("error"));
                        bundle.putString("response", jsonObject.getString("response"));
                        mFirebaseAnalytics.logEvent("download_song", bundle);
                        if (jsonObject.getBoolean("error"))
                            // Response failed.
                            listener.onSuccess(jsonObject.getString("response"));
                        else {
                            Object response = jsonObject.opt("response");
                            if (response instanceof String)
                                // Response successful but response is string.
                                listener.onSuccess(String.valueOf(response));
                            else if (response instanceof JSONObject) {
                                String file_location_url = jsonObject.getJSONObject("response").getString("file_name");
                                JSONObject song_data = jsonObject.getJSONObject("response").getJSONObject("metadata").getJSONObject("info");
                                changeSongData(song_data.getString("title"), song_data.getString("thumbnail"), song_data.getInt("trackCount"));
                                // Response successful. -> JSON 200
                                Pump.newRequest(file_location_url)
                                        .setRetry(5, 5000)
                                        .setRequestBuilder(new Request.Builder().cacheControl(CacheControl.FORCE_NETWORK))
                                        .listener(new DownloadListener() {
                                            @Override
                                            public void onSuccess() {
                                                DownloadInfo downloadInfo = getDownloadInfo();
                                                String download_filename = downloadInfo.getFilePath();
                                                try {
                                                    if (download_filename == null)
                                                        throw new Error("File not downloaded at all...");
                                                    new DecompressFast(download_filename, Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).getAbsolutePath() + "/SoundGloudDownloader/").unzip();
                                                    deleteFile(download_filename);
                                                    listener.onSuccess("Download complete.");
                                                } catch (Exception e) {
                                                    FirebaseCrashlytics.getInstance().recordException(e);
                                                    listener.onFailure(e.toString());
                                                }
                                            }

                                            @Override
                                            public void onFailed() {
                                                listener.onFailure("Download Failed. Try again in 3 minutes.");
                                            }

                                            @Override
                                            public void onProgress(int progress) {
                                                DownloadInfo info = getDownloadInfo();
                                                download_song_textview_button_download.setText(deobfuscate(stringsArray[2]) + " " + info.getProgress() + "% ...");
                                                download_song_progressbar_progress.setIndeterminate(false);
                                                download_song_progressbar_progress.setProgress(progress, true);
                                                if (progress == 100)
                                                    download_song_progressbar_progress.setIndeterminate(true);
                                            }
                                        })
                                        .submit();
                            } else {
                                // Response successful but response type idk.
                                listener.onSuccess(String.valueOf(response));
                            }
                        }
                    } catch (JSONException e) {
                        FirebaseCrashlytics.getInstance().recordException(e);
                        listener.onFailure("Failed to extract information from URL.");
                    }
                }

                @Override
                public void onAPISoundCloudDownloadFailed(String error) {
                    listener.onFailure(error);
                }
            }).execute(API_ROUTE + "/download?url=" + soundCloudUrl);
        }
    }

    protected void downloadFromAPI(String soundCloudUrl) {
        new Thread(new downloadSongURL(soundCloudUrl, new DownloadSongListener() {
            @Override
            public void onSuccess(String message_success) {
                Toast.makeText(DownloadActivity.this, message_success, Toast.LENGTH_SHORT).show();
                resetDownloadButton();
            }

            @Override
            public void onFailure(String error) {
                Toast.makeText(DownloadActivity.this, error, Toast.LENGTH_LONG).show();
                resetDownloadButton();
            }
        })).start();
    }

    protected void resetDownloadButton() {
        download_song_progressbar_progress.setVisibility(View.GONE);
        download_song_textview_button_download.setText(deobfuscate(stringsArray[19]));
        download_song_button_download.setClickable(true);
        download_song_button_download.setEnabled(true);
    }

    protected interface loadRewardedAdComplete {
        void onComplete();
    }

    protected void loadRewardedAd(loadRewardedAdComplete loadRewardedAdCompleteListener) {
        RewardedAd.load(this, deobfuscate(stringsArray[20]), new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                if (rewardedAdIntents <= rewardedAdIntentsMax) {
                    rewardedAd = null;
                    loadRewardedAd(loadRewardedAdCompleteListener);
                    rewardedAdIntents += 1;
                } else {
                    if (loadRewardedAdCompleteListener != null)
                        loadRewardedAdCompleteListener.onComplete();
                }
            }

            @Override
            public void onAdLoaded(@NonNull RewardedAd ad) {
                rewardedAdIntents = 0;
                rewardedAd = ad;
                if (loadRewardedAdCompleteListener != null)
                    loadRewardedAdCompleteListener.onComplete();
            }
        });
    }

    protected void requestPermissionsStorage() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED)
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.READ_EXTERNAL_STORAGE},1);
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED)
            ActivityCompat.requestPermissions(this, new String[]{ Manifest.permission.WRITE_EXTERNAL_STORAGE },2);
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.MANAGE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
                ActivityCompat.requestPermissions(this, new String[]{ Manifest.permission.MANAGE_EXTERNAL_STORAGE },3);
    }

    protected static String deobfuscate(String str) {
        return new String(Base64.getDecoder().decode(str)).replace("\n", "");
    }

    protected static List<File> getAllFiles() {
        List<File> fileList = new ArrayList<>();
        File directory = new File("/storage/emulated/0/Android/data/com.mftechnologydevelopment.soundglouddownloader/files/pump_cache/");
        if (directory.exists() && directory.isDirectory()) {
            File[] files = directory.listFiles();
            if (files != null)
                for (File file : files) {
                    if (file.isFile())
                        fileList.add(file);
                }
        }
        return fileList;
    }

    public boolean deleteFile(String filePath) {
        try {
            File fileToDelete = new File(filePath);
            return fileToDelete.exists() && fileToDelete.delete();
        } catch(Exception _ignored) {
            return false;
        }
    }

    protected void changeSongData(String name, String imageLocation, int soundtracks) {
        download_song_song_textView.setText(name);
        download_song_sounds_textView.setText(soundtracks + "/40 soundtracks.");
        Glide.with(this)
                .load(imageLocation)
                .diskCacheStrategy(DiskCacheStrategy.ALL)
                .transition(DrawableTransitionOptions.withCrossFade(150))
                .into(download_song_image_imageView);
    }

    protected static String generateAuthHash() {
        String inputString = deobfuscate(stringsArray[17]);
        // Variables...
        Calendar currentDate = Calendar.getInstance();
        String[] year_array = String.valueOf(currentDate.get(Calendar.YEAR)).split("");
        int year = Integer.parseInt(year_array[2]+year_array[3]);
        String formatDateKey = String.valueOf(year);
        inputString += formatDateKey;
        // Verify to return...
        if (signatureCache.has(formatDateKey))
            try {
                return signatureCache.getString(formatDateKey);
            } catch (JSONException e) {
                FirebaseCrashlytics.getInstance().recordException(e);
            }
        // Convert input string to ASCII characters
        char[] inputChars = inputString.toCharArray();
        int[] asciiChars = new int[inputChars.length];
        for (int i = 0; i < inputChars.length; i++)
            asciiChars[i] = inputChars[i];
        // Modify ASCII values based on the given pattern
        for (int i = 0; i < asciiChars.length; i++)
            asciiChars[i] += (i % 2 == 0 ? (year / 2) + 1 : year + 1);
        // Convert modified ASCII values back to characters
        StringBuilder modifiedString = new StringBuilder();
        for (int asciiChar : asciiChars) {
            char charCode = (char) asciiChar;
            modifiedString.append(Character.isLetter(charCode) ? charCode : "");
        }
        // Generate hash from the modified string using month and year as seed
        int hashed = 0;
        for (int i = 0; i < modifiedString.length(); i++) {
            hashed = (hashed << 5) + hashed + modifiedString.charAt(i) + year;
            hashed = hashed & hashed; // Convert to 32bit integer
            hashed = Math.abs(hashed); // Make sure it's positive
        }
        try {
            byte[] hash = MessageDigest.getInstance("SHA-1")
                    .digest((modifiedString+"_"+hashed+deobfuscate(stringsArray[18])).getBytes());
            // Convert byte array to hexadecimal string
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            try {
                signatureCache.put(formatDateKey, hexString.toString());
                return signatureCache.getString(formatDateKey);
            } catch (JSONException e) {
                FirebaseCrashlytics.getInstance().recordException(e);
                return "";
            }
        } catch (NoSuchAlgorithmException e) {
            FirebaseCrashlytics.getInstance().recordException(e);
            return "";
        }
    }

    protected interface APISoundCloudDownloadListener {
        void onAPISoundCloudDownloaded(JSONObject jsonObject);
        void onAPISoundCloudDownloadFailed(String error);
    }

    protected static class APISoundCloudDownloader extends AsyncTask<String, Void, JSONObject> {
        protected final APISoundCloudDownloadListener mListener;
        protected String error = "";

        APISoundCloudDownloader(APISoundCloudDownloadListener listener) {
            this.mListener = listener;
        }

        @Override
        protected JSONObject doInBackground(String... urls) {
            String urlString = urls[0];
            try {
                URL url = new URL(urlString);
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setRequestProperty("authHash", generateAuthHash());
                connection.setRequestMethod("POST");
                connection.connect();
                if (connection.getResponseCode() == HttpURLConnection.HTTP_OK) {
                    InputStream inputStream = connection.getInputStream();
                    StringBuilder stringBuilder = new StringBuilder();
                    String line;
                    while ((line = new BufferedReader(new InputStreamReader(inputStream)).readLine()) != null)
                        stringBuilder.append(line);
                    inputStream.close();
                    return new JSONObject(stringBuilder.toString());
                } else
                    error = connection.getResponseCode() + ": " + connection.getResponseMessage();
            } catch (IOException | JSONException e) {
                error = e.toString();
                FirebaseCrashlytics.getInstance().recordException(e);
            }
            return null;
        }

        @Override
        protected void onPostExecute(JSONObject jsonObject) {
            if (jsonObject != null)
                mListener.onAPISoundCloudDownloaded(jsonObject);
            else
                mListener.onAPISoundCloudDownloadFailed(error);
        }
    }
}