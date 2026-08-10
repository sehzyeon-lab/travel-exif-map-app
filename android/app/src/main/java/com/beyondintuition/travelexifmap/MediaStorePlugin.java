package com.beyondintuition.travelexifmap;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;

import androidx.core.content.ContextCompat;
import androidx.exifinterface.media.ExifInterface;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Reads the device gallery through the Android MediaStore.
 *
 * The MediaStore LATITUDE/LONGITUDE columns were removed in Android 10 (API 29), so GPS is read
 * from each file's own EXIF header instead. Android 10+ also redacts location EXIF from bytes
 * served over a plain content:// URI, so the URI is unwrapped with MediaStore.setRequireOriginal()
 * (which is what ACCESS_MEDIA_LOCATION is for) before the header is parsed.
 */
@CapacitorPlugin(
    name = "MediaStoreScanner",
    permissions = {
        @Permission(alias = MediaStorePlugin.ALIAS_MEDIA_IMAGES, strings = { Manifest.permission.READ_MEDIA_IMAGES }),
        @Permission(alias = MediaStorePlugin.ALIAS_READ_STORAGE, strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        @Permission(alias = MediaStorePlugin.ALIAS_MEDIA_LOCATION, strings = { Manifest.permission.ACCESS_MEDIA_LOCATION })
    }
)
public class MediaStorePlugin extends Plugin {

    static final String ALIAS_MEDIA_IMAGES = "mediaImages";
    static final String ALIAS_READ_STORAGE = "readStorage";
    static final String ALIAS_MEDIA_LOCATION = "mediaLocation";

    private static final String PERMISSION_CALLBACK = "handleScanPermission";
    private static final String EVENT_PROGRESS = "mediaScanProgress";

    /** Android 14 partial access ("Select photos"). Not in the SDK constants until API 34. */
    private static final String READ_MEDIA_VISUAL_USER_SELECTED = "android.permission.READ_MEDIA_VISUAL_USER_SELECTED";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    // region permissions

    private boolean isGranted(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * Capacitor derives an alias' state from every permission it contains, so a legacy permission
     * that can never be granted on a modern OS would pin the alias to "denied" forever. The
     * per-SDK check below is the source of truth instead.
     */
    private boolean hasReadAccess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return isGranted(Manifest.permission.READ_MEDIA_IMAGES) || isGranted(READ_MEDIA_VISUAL_USER_SELECTED);
        }
        return isGranted(Manifest.permission.READ_EXTERNAL_STORAGE);
    }

    private boolean hasMediaLocationAccess() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true;
        return isGranted(Manifest.permission.ACCESS_MEDIA_LOCATION);
    }

    private String[] aliasesToRequest(boolean includeMediaLocation) {
        List<String> aliases = new ArrayList<>();
        if (!hasReadAccess()) {
            aliases.add(
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? ALIAS_MEDIA_IMAGES : ALIAS_READ_STORAGE
            );
        }
        if (includeMediaLocation && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !hasMediaLocationAccess()) {
            aliases.add(ALIAS_MEDIA_LOCATION);
        }
        return aliases.toArray(new String[0]);
    }

    @PluginMethod
    public void checkAccess(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("read", hasReadAccess());
        ret.put("mediaLocation", hasMediaLocationAccess());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        String[] aliases = aliasesToRequest(true);
        if (aliases.length == 0) {
            checkAccess(call);
            return;
        }
        requestPermissionForAliases(aliases, call, "handleAccessRequest");
    }

    @PermissionCallback
    private void handleAccessRequest(PluginCall call) {
        checkAccess(call);
    }

    // endregion

    @PluginMethod
    public void scanGallery(PluginCall call) {
        // A background refresh passes false so relaunching the app never pops a permission dialog
        // the user did not ask for; the explicit scan button passes true.
        boolean requestLocation = Boolean.TRUE.equals(call.getBoolean("requestLocationPermission", true));
        String[] aliases = aliasesToRequest(requestLocation);
        if (aliases.length > 0) {
            requestPermissionForAliases(aliases, call, PERMISSION_CALLBACK);
            return;
        }
        runScan(call);
    }

    @PermissionCallback
    private void handleScanPermission(PluginCall call) {
        // ACCESS_MEDIA_LOCATION being denied only costs us GPS, so only read access is fatal.
        if (!hasReadAccess()) {
            call.reject("PERMISSION_DENIED", "PERMISSION_DENIED");
            return;
        }
        runScan(call);
    }

    private void runScan(PluginCall call) {
        final int limit = call.getInt("limit", 0);
        final boolean skipScreenshots = Boolean.TRUE.equals(call.getBoolean("skipScreenshots", true));
        // Millis. Only images modified after this are re-read, which turns a launch-time refresh
        // into a near-instant query instead of a full-device EXIF sweep.
        final long since = (long) (double) call.getDouble("since", 0d);

        executor.execute(() -> {
            try {
                doScan(call, limit, skipScreenshots, since);
            } catch (Throwable t) {
                call.reject(describe(t), "SCAN_FAILED", asException(t));
            }
        });
    }

    /** One MediaStore row, held while its EXIF header is read off the main scan thread. */
    private static class Row {
        long id;
        String name;
        String bucket;
        String mimeType;
        long size;
        int width;
        int height;
        long dateTaken;
        long dateModified;
        Uri uri;
        Exif exif;
    }

    private void doScan(PluginCall call, int limit, boolean skipScreenshots, long since) {
        ContentResolver resolver = getContext().getContentResolver();
        boolean canReadLocation = hasMediaLocationAccess();

        String[] projection = new String[] {
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.DATE_TAKEN,
            MediaStore.Images.Media.DATE_MODIFIED,
            MediaStore.Images.Media.SIZE,
            MediaStore.Images.Media.MIME_TYPE,
            MediaStore.Images.Media.BUCKET_DISPLAY_NAME,
            MediaStore.Images.Media.WIDTH,
            MediaStore.Images.Media.HEIGHT
        };

        String selection = null;
        String[] selectionArgs = null;
        if (since > 0) {
            // DATE_MODIFIED is in seconds.
            selection = MediaStore.Images.Media.DATE_MODIFIED + " > ?";
            selectionArgs = new String[] { String.valueOf(since / 1000L) };
        }

        List<Row> rows = new ArrayList<>();
        int skipped = 0;

        Cursor cursor = resolver.query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            projection,
            selection,
            selectionArgs,
            MediaStore.Images.Media.DATE_TAKEN + " DESC, " + MediaStore.Images.Media.DATE_MODIFIED + " DESC"
        );

        if (cursor != null) {
            try {
                int idCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                int nameCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME);
                int takenCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_TAKEN);
                int modifiedCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_MODIFIED);
                int sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE);
                int mimeCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE);
                int bucketCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_DISPLAY_NAME);
                int widthCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH);
                int heightCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT);

                while (cursor.moveToNext()) {
                    if (limit > 0 && rows.size() >= limit) break;

                    Row row = new Row();
                    row.id = cursor.getLong(idCol);
                    row.name = cursor.getString(nameCol);
                    row.bucket = cursor.getString(bucketCol);
                    if (row.name == null || row.name.isEmpty()) row.name = "IMG_" + row.id;

                    if (skipScreenshots && isScreenshot(row.name, row.bucket)) {
                        skipped++;
                        continue;
                    }

                    row.mimeType = cursor.getString(mimeCol);
                    row.size = cursor.getLong(sizeCol);
                    row.width = cursor.getInt(widthCol);
                    row.height = cursor.getInt(heightCol);
                    // DATE_TAKEN is epoch millis and is null when the image has no EXIF date;
                    // DATE_MODIFIED is epoch SECONDS.
                    row.dateTaken = cursor.isNull(takenCol) ? 0L : cursor.getLong(takenCol);
                    row.dateModified = cursor.isNull(modifiedCol) ? 0L : cursor.getLong(modifiedCol) * 1000L;
                    row.uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, row.id);

                    rows.add(row);
                }
            } finally {
                cursor.close();
            }
        }

        int total = rows.size();
        int withGps = readExifForRows(resolver, rows, canReadLocation);

        JSArray photos = new JSArray();
        for (Row row : rows) {
            JSObject photo = new JSObject();
            photo.put("id", String.valueOf(row.id));
            photo.put("name", row.name);
            photo.put("uri", row.uri.toString());
            photo.put("album", row.bucket);
            photo.put("size", row.size);
            photo.put("mimeType", row.mimeType);
            photo.put("width", row.width);
            photo.put("height", row.height);

            Exif exif = row.exif != null ? row.exif : new Exif();
            if (exif.hasGps) {
                photo.put("hasGps", true);
                photo.put("latitude", exif.latitude);
                photo.put("longitude", exif.longitude);
            } else {
                photo.put("hasGps", false);
                photo.put("latitude", JSObject.NULL);
                photo.put("longitude", JSObject.NULL);
            }
            if (exif.altitude != null) photo.put("altitude", exif.altitude);
            if (exif.make != null) photo.put("cameraMake", exif.make);
            if (exif.model != null) photo.put("cameraModel", exif.model);
            if (exif.iso != null) photo.put("iso", exif.iso);
            if (exif.aperture != null) photo.put("aperture", exif.aperture);

            photo.put("timestamp",
                exif.dateTaken > 0 ? exif.dateTaken
                    : row.dateTaken > 0 ? row.dateTaken
                    : row.dateModified > 0 ? row.dateModified
                    : System.currentTimeMillis()
            );

            photos.put(photo);
        }

        notifyProgress(total, total, withGps);

        JSObject ret = new JSObject();
        ret.put("photos", photos);
        ret.put("count", photos.length());
        ret.put("total", total);
        ret.put("skipped", skipped);
        ret.put("withGps", withGps);
        ret.put("mediaLocationGranted", canReadLocation);
        ret.put("scannedAt", System.currentTimeMillis());
        call.resolve(ret);
    }

    /**
     * Reads EXIF for every row across a small thread pool. The work is I/O bound (one content
     * provider open per file), so running it serially is what made a full gallery pass slow.
     *
     * @return how many rows turned out to have usable GPS
     */
    private int readExifForRows(ContentResolver resolver, List<Row> rows, boolean canReadLocation) {
        int total = rows.size();
        notifyProgress(0, total, 0);
        if (total == 0) return 0;

        int threads = Math.max(2, Math.min(6, Runtime.getRuntime().availableProcessors()));
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        AtomicInteger done = new AtomicInteger();
        AtomicInteger withGps = new AtomicInteger();

        for (Row row : rows) {
            pool.execute(() -> {
                row.exif = readExif(resolver, row.uri, canReadLocation);
                if (row.exif.hasGps) withGps.incrementAndGet();
                int n = done.incrementAndGet();
                if (n % 50 == 0) notifyProgress(n, total, withGps.get());
            });
        }

        pool.shutdown();
        try {
            if (!pool.awaitTermination(30, TimeUnit.MINUTES)) pool.shutdownNow();
        } catch (InterruptedException e) {
            pool.shutdownNow();
            Thread.currentThread().interrupt();
        }

        return withGps.get();
    }

    private void notifyProgress(int current, int total, int withGps) {
        JSObject progress = new JSObject();
        progress.put("current", current);
        progress.put("total", total);
        progress.put("withGps", withGps);
        notifyListeners(EVENT_PROGRESS, progress);
    }

    private static boolean isScreenshot(String name, String bucket) {
        String haystack = ((name == null ? "" : name) + " " + (bucket == null ? "" : bucket)).toLowerCase(Locale.ROOT);
        return haystack.contains("screenshot")
            || haystack.contains("screen_shot")
            || haystack.contains("screenrecord")
            || haystack.contains("screen_record")
            || haystack.contains("스크린샷")
            || haystack.contains("캡처")
            || haystack.contains("캡쳐");
    }

    // region EXIF

    private static class Exif {
        boolean hasGps;
        double latitude;
        double longitude;
        Integer altitude;
        long dateTaken;
        String make;
        String model;
        Integer iso;
        String aperture;
    }

    private Exif readExif(ContentResolver resolver, Uri uri, boolean canReadLocation) {
        Exif out = new Exif();

        // Without setRequireOriginal the platform hands back a copy with GPS tags stripped.
        Uri readUri = uri;
        if (canReadLocation && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                readUri = MediaStore.setRequireOriginal(uri);
            } catch (Exception ignored) {
                readUri = uri;
            }
        }

        if (!readExifFrom(resolver, readUri, out) && !readUri.equals(uri)) {
            // Some OEM providers reject the "require original" URI outright; fall back to redacted.
            readExifFrom(resolver, uri, out);
        }
        return out;
    }

    private boolean readExifFrom(ContentResolver resolver, Uri uri, Exif out) {
        try (InputStream stream = resolver.openInputStream(uri)) {
            if (stream == null) return false;
            ExifInterface exif = new ExifInterface(stream);

            double[] latLng = exif.getLatLong();
            if (latLng != null && isValidCoordinate(latLng[0], latLng[1])) {
                out.hasGps = true;
                out.latitude = latLng[0];
                out.longitude = latLng[1];
            }

            double altitude = exif.getAltitude(Double.NaN);
            if (!Double.isNaN(altitude)) out.altitude = (int) Math.round(altitude);

            out.dateTaken = parseExifDate(
                exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL),
                exif.getAttribute(ExifInterface.TAG_DATETIME)
            );

            out.make = trimToNull(exif.getAttribute(ExifInterface.TAG_MAKE));
            out.model = trimToNull(exif.getAttribute(ExifInterface.TAG_MODEL));

            String iso = exif.getAttribute(ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY);
            if (iso == null) iso = exif.getAttribute(ExifInterface.TAG_ISO_SPEED_RATINGS);
            if (iso != null) {
                try {
                    out.iso = Integer.parseInt(iso.trim());
                } catch (NumberFormatException ignored) {}
            }

            double fNumber = exif.getAttributeDouble(ExifInterface.TAG_F_NUMBER, 0);
            if (fNumber > 0) out.aperture = "f/" + String.format(Locale.US, "%.1f", fNumber);

            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    /** EXIF dates are "yyyy:MM:dd HH:mm:ss" in local time with no zone; parsed manually to stay allocation-light. */
    private static long parseExifDate(String... candidates) {
        for (String value : candidates) {
            if (value == null || value.length() < 19) continue;
            try {
                int year = Integer.parseInt(value.substring(0, 4));
                int month = Integer.parseInt(value.substring(5, 7));
                int day = Integer.parseInt(value.substring(8, 10));
                int hour = Integer.parseInt(value.substring(11, 13));
                int minute = Integer.parseInt(value.substring(14, 16));
                int second = Integer.parseInt(value.substring(17, 19));
                if (year < 1900) continue;
                java.util.Calendar cal = java.util.Calendar.getInstance();
                cal.clear();
                cal.set(year, month - 1, day, hour, minute, second);
                return cal.getTimeInMillis();
            } catch (Exception ignored) {}
        }
        return 0L;
    }

    private static boolean isValidCoordinate(double lat, double lng) {
        if (Double.isNaN(lat) || Double.isNaN(lng)) return false;
        if (lat == 0.0 && lng == 0.0) return false;
        return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    }

    private static String describe(Throwable t) {
        String message = t.getMessage();
        return message != null && !message.isEmpty() ? message : t.getClass().getSimpleName();
    }

    private static Exception asException(Throwable t) {
        return t instanceof Exception ? (Exception) t : new Exception(t);
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    // endregion

    // region image data

    /**
     * Thumbnails as data URIs. The WebView loads the app from a remote origin, so http://localhost
     * content URLs would be blocked as mixed content — base64 sidesteps that entirely.
     */
    @PluginMethod
    public void getThumbnails(PluginCall call) {
        if (!hasReadAccess()) {
            call.reject("PERMISSION_DENIED", "PERMISSION_DENIED");
            return;
        }
        JSArray idsArray = call.getArray("ids");
        if (idsArray == null) {
            call.reject("INVALID_ARGS", "ids is required");
            return;
        }
        final List<String> ids;
        try {
            ids = idsArray.toList();
        } catch (Exception e) {
            call.reject("INVALID_ARGS", "ids must be an array of media ids");
            return;
        }
        final int size = Math.max(64, Math.min(512, call.getInt("size", 256)));

        executor.execute(() -> {
            ContentResolver resolver = getContext().getContentResolver();
            JSObject thumbs = new JSObject();
            for (Object raw : ids) {
                if (raw == null) continue;
                try {
                    long id = Long.parseLong(String.valueOf(raw));
                    String dataUrl = loadThumbnail(resolver, id, size);
                    if (dataUrl != null) thumbs.put(String.valueOf(id), dataUrl);
                } catch (Exception ignored) {}
            }
            JSObject ret = new JSObject();
            ret.put("thumbs", thumbs);
            call.resolve(ret);
        });
    }

    /** Full-size (downscaled) image for the detail view. */
    @PluginMethod
    public void getImage(PluginCall call) {
        if (!hasReadAccess()) {
            call.reject("PERMISSION_DENIED", "PERMISSION_DENIED");
            return;
        }
        final String id = call.getString("id");
        if (id == null) {
            call.reject("INVALID_ARGS", "id is required");
            return;
        }
        final int maxSize = Math.max(256, Math.min(2048, call.getInt("maxSize", 1280)));

        executor.execute(() -> {
            try {
                long mediaId = Long.parseLong(id);
                Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, mediaId);
                ContentResolver resolver = getContext().getContentResolver();

                BitmapFactory.Options bounds = new BitmapFactory.Options();
                bounds.inJustDecodeBounds = true;
                try (InputStream stream = resolver.openInputStream(uri)) {
                    BitmapFactory.decodeStream(stream, null, bounds);
                }

                BitmapFactory.Options options = new BitmapFactory.Options();
                options.inSampleSize = calculateSampleSize(bounds.outWidth, bounds.outHeight, maxSize);
                Bitmap bitmap;
                try (InputStream stream = resolver.openInputStream(uri)) {
                    bitmap = BitmapFactory.decodeStream(stream, null, options);
                }
                if (bitmap == null) {
                    call.reject("DECODE_FAILED", "Could not decode image " + id);
                    return;
                }

                JSObject ret = new JSObject();
                ret.put("dataUrl", toDataUrl(bitmap, 85));
                bitmap.recycle();
                call.resolve(ret);
            } catch (Throwable t) {
                call.reject(describe(t), "IMAGE_FAILED", asException(t));
            }
        });
    }

    private String loadThumbnail(ContentResolver resolver, long id, int size) {
        Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
        Bitmap bitmap = null;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                bitmap = resolver.loadThumbnail(uri, new Size(size, size), null);
            } else {
                bitmap = MediaStore.Images.Thumbnails.getThumbnail(
                    resolver, id, MediaStore.Images.Thumbnails.MINI_KIND, null
                );
            }
        } catch (Throwable ignored) {}

        if (bitmap == null) {
            // No cached thumbnail (common for freshly imported files) — decode a downscaled copy.
            try {
                BitmapFactory.Options bounds = new BitmapFactory.Options();
                bounds.inJustDecodeBounds = true;
                try (InputStream stream = resolver.openInputStream(uri)) {
                    BitmapFactory.decodeStream(stream, null, bounds);
                }
                BitmapFactory.Options options = new BitmapFactory.Options();
                options.inSampleSize = calculateSampleSize(bounds.outWidth, bounds.outHeight, size);
                try (InputStream stream = resolver.openInputStream(uri)) {
                    bitmap = BitmapFactory.decodeStream(stream, null, options);
                }
            } catch (Throwable ignored) {}
        }

        if (bitmap == null) return null;
        String dataUrl = toDataUrl(bitmap, 72);
        bitmap.recycle();
        return dataUrl;
    }

    private static int calculateSampleSize(int width, int height, int target) {
        int sampleSize = 1;
        int longest = Math.max(width, height);
        while (longest / sampleSize > target * 2) {
            sampleSize *= 2;
        }
        return Math.max(1, sampleSize);
    }

    private static String toDataUrl(Bitmap bitmap, int quality) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out);
        return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }

    // endregion

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
