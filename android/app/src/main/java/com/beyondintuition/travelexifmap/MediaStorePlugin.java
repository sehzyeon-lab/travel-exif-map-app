package com.beyondintuition.travelexifmap;

import android.content.ContentUris;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MediaStoreScanner")
public class MediaStorePlugin extends Plugin {

    @PluginMethod
    public void scanGallery(PluginCall call) {
        JSArray photos = new JSArray();
        
        String[] projection = new String[] {
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.DATE_TAKEN,
            MediaStore.Images.Media.LATITUDE,
            MediaStore.Images.Media.LONGITUDE,
            MediaStore.Images.Media.SIZE
        };

        String sortOrder = MediaStore.Images.Media.DATE_TAKEN + " DESC";

        try {
            Cursor cursor = getContext().getContentResolver().query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                projection,
                null,
                null,
                sortOrder
            );

            if (cursor != null) {
                int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                int nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME);
                int dateColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_TAKEN);
                int latColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.LATITUDE);
                int lngColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.LONGITUDE);
                int sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE);

                while (cursor.moveToNext()) {
                    long id = cursor.getLong(idColumn);
                    String name = cursor.getString(nameColumn);
                    long dateTaken = cursor.getLong(dateColumn);
                    double lat = cursor.getDouble(latColumn);
                    double lng = cursor.getDouble(lngColumn);
                    long size = cursor.getLong(sizeColumn);

                    Uri contentUri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);

                    JSObject photo = new JSObject();
                    photo.put("id", id);
                    photo.put("name", name != null ? name : "photo_" + id);
                    photo.put("uri", contentUri.toString());
                    photo.put("timestamp", dateTaken > 0 ? dateTaken : System.currentTimeMillis());
                    photo.put("size", size);
                    
                    boolean hasGps = (lat != 0.0 || lng != 0.0) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
                    photo.put("hasGps", hasGps);
                    if (hasGps) {
                        photo.put("latitude", lat);
                        photo.put("longitude", lng);
                    } else {
                        photo.put("latitude", null);
                        photo.put("longitude", null);
                    }

                    photos.put(photo);
                }
                cursor.close();
            }

            JSObject ret = new JSObject();
            ret.put("photos", photos);
            ret.put("count", photos.length());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Error querying Android MediaStore ContentResolver: " + e.getMessage(), e);
        }
    }
}
