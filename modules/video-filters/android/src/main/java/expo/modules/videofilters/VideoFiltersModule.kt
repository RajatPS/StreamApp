package expo.modules.videofilters

import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.RgbMatrix
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

@OptIn(UnstableApi::class)
class VideoFiltersModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoVideoFilters")

    AsyncFunction("applyFilter") { sourceUri: String, filter: String, promise: Promise ->
      val context = appContext.reactContext?.applicationContext
      if (context == null) {
        promise.reject("E_CONTEXT", "Application context is unavailable.", null)
        return@AsyncFunction
      }

      val input = Uri.parse(sourceUri)
      val output = File(context.cacheDir, "filtered-${System.currentTimeMillis()}.mp4")
      val effect = try {
        ColorMatrixEffect(filter)
      } catch (error: IllegalArgumentException) {
        promise.reject("E_FILTER", error.message ?: "Unsupported video filter.", error)
        return@AsyncFunction
      }

      val editedItem = EditedMediaItem.Builder(MediaItem.fromUri(input))
        .setEffects(Effects(emptyList(), listOf(effect)))
        .build()

      val transformer = Transformer.Builder(context)
        .addListener(object : Transformer.Listener {
          override fun onCompleted(
            composition: androidx.media3.transformer.Composition,
            exportResult: ExportResult,
          ) {
            promise.resolve(Uri.fromFile(output).toString())
          }

          override fun onError(
            composition: androidx.media3.transformer.Composition,
            exportResult: ExportResult,
            exportException: ExportException,
          ) {
            output.delete()
            promise.reject("E_FILTER_EXPORT", "Could not apply the video filter.", exportException)
          }
        })
        .build()

      try {
        transformer.start(editedItem, output.absolutePath)
      } catch (error: Exception) {
        output.delete()
        promise.reject("E_FILTER_EXPORT", "Could not start video filter export.", error)
      }
    }
  }
}

@OptIn(UnstableApi::class)
private class ColorMatrixEffect(filter: String) : RgbMatrix {
  private val matrix = when (filter) {
    "Grayscale" -> floatArrayOf(
      0.2126f, 0.2126f, 0.2126f, 0f,
      0.7152f, 0.7152f, 0.7152f, 0f,
      0.0722f, 0.0722f, 0.0722f, 0f,
      0f, 0f, 0f, 1f,
    )
    "Sepia" -> floatArrayOf(
      0.393f, 0.349f, 0.272f, 0f,
      0.769f, 0.686f, 0.534f, 0f,
      0.189f, 0.168f, 0.131f, 0f,
      0f, 0f, 0f, 1f,
    )
    "Vintage" -> floatArrayOf(
      0.78f, 0.10f, 0.05f, 0f,
      0.14f, 0.78f, 0.12f, 0f,
      0.06f, 0.07f, 0.68f, 0f,
      0.06f, 0.05f, 0.05f, 1f,
    )
    "Cool" -> floatArrayOf(
      0.92f, 0f, 0f, 0f,
      0f, 0.98f, 0f, 0f,
      0f, 0f, 1.12f, 0f,
      0f, 0f, 0.025f, 1f,
    )
    "Warm" -> floatArrayOf(
      1.10f, 0f, 0f, 0f,
      0f, 1.02f, 0f, 0f,
      0f, 0f, 0.90f, 0f,
      0.025f, 0.012f, 0f, 1f,
    )
    else -> throw IllegalArgumentException("Unsupported video filter: $filter")
  }

  override fun getMatrix(presentationTimeUs: Long, useHdr: Boolean): FloatArray = matrix
}
