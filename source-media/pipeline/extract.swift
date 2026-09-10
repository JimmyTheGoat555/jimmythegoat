// Streams decoded video frames as raw RGBA8 to stdout, preceded by a
// single "W H\n" text header. Used by process.py to read the dance MP4s
// without needing ffmpeg installed — AVFoundation is already on the box.
import Foundation
import AVFoundation
import CoreImage

let args = CommandLine.arguments
guard args.count >= 2 else {
    FileHandle.standardError.write("usage: extract <input.mp4> [maxDim]\n".data(using: .utf8)!)
    exit(1)
}
let inputURL = URL(fileURLWithPath: args[1])
let maxDim = args.count > 2 ? (Int(args[2]) ?? 0) : 0

let asset = AVAsset(url: inputURL)
guard let track = asset.tracks(withMediaType: .video).first else {
    FileHandle.standardError.write("no video track\n".data(using: .utf8)!)
    exit(1)
}

let transformed = track.naturalSize.applying(track.preferredTransform)
var W = Int(abs(transformed.width).rounded())
var H = Int(abs(transformed.height).rounded())
var scale: CGFloat = 1
if maxDim > 0 && max(W, H) > maxDim {
    scale = CGFloat(maxDim) / CGFloat(max(W, H))
    W = Int((CGFloat(W) * scale).rounded())
    H = Int((CGFloat(H) * scale).rounded())
}

let fps = track.nominalFrameRate > 0 ? track.nominalFrameRate : 30
FileHandle.standardOutput.write("\(W) \(H) \(fps)\n".data(using: .utf8)!)

let reader = try AVAssetReader(asset: asset)
let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
])
reader.add(output)
reader.startReading()

let ciContext = CIContext(options: [.useSoftwareRenderer: false])
let colorSpace = CGColorSpaceCreateDeviceRGB()
let bounds = CGRect(x: 0, y: 0, width: W, height: H)
var buf = [UInt8](repeating: 0, count: W * H * 4)

func normalize(_ image: CIImage) -> CIImage {
    image.transformed(by: CGAffineTransform(translationX: -image.extent.origin.x,
                                            y: -image.extent.origin.y))
}

while let sample = output.copyNextSampleBuffer() {
    guard let pb = CMSampleBufferGetImageBuffer(sample) else { continue }
    var ci = CIImage(cvPixelBuffer: pb)
    if !track.preferredTransform.isIdentity {
        ci = normalize(ci.transformed(by: track.preferredTransform))
    }
    if scale != 1 {
        ci = normalize(ci.transformed(by: CGAffineTransform(scaleX: scale, y: scale)))
    }
    buf.withUnsafeMutableBytes { ptr in
        ciContext.render(ci, toBitmap: ptr.baseAddress!, rowBytes: W * 4,
                         bounds: bounds, format: .RGBA8, colorSpace: colorSpace)
    }
    FileHandle.standardOutput.write(Data(buf))
}
