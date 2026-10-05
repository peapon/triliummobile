// OCR a set of screenshots into positioned text, using the system Vision framework.
//
// Why this exists: the agent working in this repository cannot see images. Design references arrive
// as screenshots, so the interaction structure — navigation labels, button names, section headings,
// what sits where — has to be recovered as text. Bounding boxes are included because *where* a label
// is carries as much meaning as the label: a word in a left rail is navigation, the same word in a
// top bar is a title.
//
// Coordinates are printed top-left origin, normalised to 0..1, so they can be compared directly
// across screenshots of different sizes.
//
//   swift tools/ocr.swift <image> [<image> ...]

import AppKit
import Foundation
import Vision

let arguments = CommandLine.arguments
guard arguments.count > 1 else {
    FileHandle.standardError.write("usage: ocr.swift <image> [<image> ...]\n".data(using: .utf8)!)
    exit(1)
}

for path in arguments.dropFirst() {
    guard
        let image = NSImage(contentsOfFile: path),
        let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
    else {
        print("!! could not read \(path)")
        continue
    }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = true

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

    do {
        try handler.perform([request])
    } catch {
        print("!! OCR failed for \(path): \(error)")
        continue
    }

    let width = cgImage.width
    let height = cgImage.height
    let name = (path as NSString).lastPathComponent
    print("=== \(name)  \(width)x\(height)")

    // Vision returns boxes with a bottom-left origin; flip to top-left, which is how a screenshot is
    // read and how CSS positions things.
    let observations = (request.results ?? []).compactMap { observation -> (CGRect, String)? in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let box = observation.boundingBox
        let flipped = CGRect(
            x: box.minX,
            y: 1 - box.maxY,
            width: box.width,
            height: box.height
        )
        return (flipped, candidate.string)
    }

    // Reading order: top to bottom, then left to right. Rows are grouped by vertical overlap so a
    // horizontal bar of labels comes out as one line.
    let sorted = observations.sorted { a, b in
        let aMid = a.0.midY
        let bMid = b.0.midY
        if abs(aMid - bMid) > 0.012 { return aMid < bMid }
        return a.0.minX < b.0.minX
    }

    for (box, text) in sorted {
        print(
            String(
                format: "  y=%.3f x=%.3f w=%.3f h=%.3f  %@",
                box.minY, box.minX, box.width, box.height, text
            )
        )
    }
}
