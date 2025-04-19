package com.mftechnologydevelopment.soundglouddownloader;

import com.google.android.gms.ads.MobileAds;
import com.google.firebase.crashlytics.FirebaseCrashlytics;

public class Application extends android.app.Application {

    @Override
    public void onCreate() {
        super.onCreate();
        FirebaseCrashlytics.getInstance().checkForUnsentReports();
        MobileAds.initialize(this);
    }
}
