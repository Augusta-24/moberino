#!/usr/bin/env swift
import Foundation
import Vision
import CoreImage

// Usage: ./vision_classify <image_path> [confidence_threshold]
// Prints comma-separated object/scene labels to stdout

guard CommandLine.arguments.count > 1 else {
    print("")
    exit(0)
}

let path = CommandLine.arguments[1]
let threshold = Double(CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "0.15") ?? 0.15

guard let url = URL(string: "file://" + path),
      let image = CIImage(contentsOf: url) else {
    print("")
    exit(0)
}

let request = VNClassifyImageRequest()
let handler = VNImageRequestHandler(ciImage: image, options: [:])
try? handler.perform([request])

let labels = (request.results ?? [])
    .filter { Double($0.confidence) >= threshold }
    .prefix(25)
    .map { $0.identifier }

print(labels.joined(separator: ","))
