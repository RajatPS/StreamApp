import AVFoundation
import CoreImage
import ExpoModulesCore

public class VideoFiltersModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoVideoFilters")

    AsyncFunction("applyFilter") { (sourceUri: String, filter: String, promise: Promise) in
      guard let sourceURL = URL(string: sourceUri) else {
        promise.reject("E_INPUT", "The recorded video URL is invalid.")
        return
      }

      let asset = AVURLAsset(url: sourceURL)
      let outputURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("filtered-\(UUID().uuidString).mp4")

      do {
        let videoComposition = try Self.makeVideoComposition(asset: asset, filter: filter)
        guard let exporter = AVAssetExportSession(
          asset: asset,
          presetName: AVAssetExportPresetHighestQuality
        ) else {
          promise.reject("E_FILTER_EXPORT", "Could not create a video export session.")
          return
        }

        exporter.outputURL = outputURL
        exporter.outputFileType = .mp4
        exporter.videoComposition = videoComposition
        exporter.exportAsynchronously {
          switch exporter.status {
          case .completed:
            promise.resolve(outputURL.absoluteString)
          case .failed, .cancelled:
            promise.reject(
              "E_FILTER_EXPORT",
              exporter.error?.localizedDescription ?? "Could not apply the video filter."
            )
          default:
            promise.reject("E_FILTER_EXPORT", "Video filter export did not complete.")
          }
        }
      } catch {
        promise.reject("E_FILTER_EXPORT", error.localizedDescription)
      }
    }
  }

  private static func makeVideoComposition(
    asset: AVAsset,
    filter: String
  ) throws -> AVVideoComposition {
    guard Self.filterVectors[filter] != nil else {
      throw NSError(
        domain: "ExpoVideoFilters",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Unsupported video filter: \(filter)"]
      )
    }

    return AVVideoComposition(asset: asset) { request in
      guard let vectors = Self.filterVectors[filter],
            let colorFilter = CIFilter(name: "CIColorMatrix") else {
        request.finish(with: request.sourceImage)
        return
      }

      colorFilter.setValue(request.sourceImage, forKey: kCIInputImageKey)
      colorFilter.setValue(vectors.red, forKey: "inputRVector")
      colorFilter.setValue(vectors.green, forKey: "inputGVector")
      colorFilter.setValue(vectors.blue, forKey: "inputBVector")
      colorFilter.setValue(CIVector(x: 0, y: 0, z: 0, w: 1), forKey: "inputAVector")
      colorFilter.setValue(vectors.bias, forKey: "inputBias")

      guard let output = colorFilter.outputImage else {
        request.finish(with: request.sourceImage)
        return
      }
      request.finish(with: output.cropped(to: request.sourceImage.extent))
    }
  }

  private struct Vectors {
    let red: CIVector
    let green: CIVector
    let blue: CIVector
    let bias: CIVector

    init(
      red: (CGFloat, CGFloat, CGFloat),
      green: (CGFloat, CGFloat, CGFloat),
      blue: (CGFloat, CGFloat, CGFloat),
      bias: (CGFloat, CGFloat, CGFloat) = (0, 0, 0)
    ) {
      self.red = CIVector(x: red.0, y: red.1, z: red.2, w: 0)
      self.green = CIVector(x: green.0, y: green.1, z: green.2, w: 0)
      self.blue = CIVector(x: blue.0, y: blue.1, z: blue.2, w: 0)
      self.bias = CIVector(x: bias.0, y: bias.1, z: bias.2, w: 1)
    }
  }

  private static let filterVectors: [String: Vectors] = [
    "Grayscale": Vectors(
      red: (0.2126, 0.7152, 0.0722),
      green: (0.2126, 0.7152, 0.0722),
      blue: (0.2126, 0.7152, 0.0722)
    ),
    "Sepia": Vectors(
      red: (0.393, 0.769, 0.189),
      green: (0.349, 0.686, 0.168),
      blue: (0.272, 0.534, 0.131)
    ),
    "Vintage": Vectors(
      red: (0.78, 0.14, 0.06),
      green: (0.10, 0.78, 0.07),
      blue: (0.05, 0.12, 0.68),
      bias: (0.06, 0.05, 0.05)
    ),
    "Cool": Vectors(
      red: (0.92, 0, 0),
      green: (0, 0.98, 0),
      blue: (0, 0, 1.12),
      bias: (0, 0, 0.025)
    ),
    "Warm": Vectors(
      red: (1.10, 0, 0),
      green: (0, 1.02, 0),
      blue: (0, 0, 0.90),
      bias: (0.025, 0.012, 0)
    )
  ]
}
