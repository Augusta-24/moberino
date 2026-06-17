#!/usr/bin/env swift
import Foundation
import Vision
import CoreImage

// Usage: swift ocr_vision.swift <image_path>
// Prints recognized text to stdout, one line per result

guard CommandLine.arguments.count > 1 else {
    print("")
    exit(0)
}

let path = CommandLine.arguments[1]
guard let url = URL(string: "file://" + path),
      let image = CIImage(contentsOf: url) else {
    print("")
    exit(0)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false

let handler = VNImageRequestHandler(ciImage: image, options: [:])
try? handler.perform([request])

let lines = (request.results ?? [])
    .compactMap { $0.topCandidates(1).first?.string }
    .filter { $0.trimmingCharacters(in: .whitespaces).count > 1 }

print(lines.joined(separator: " | "))
