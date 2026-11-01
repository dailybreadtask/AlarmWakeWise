import ExpoModulesCore
import MapKit

/// Suggests places from Apple Maps while the person types, and gives the coordinates of the one they pick.
/// The app keeps the coordinates on the phone. MapKit's search completer must be used on the main thread,
/// so this class is main-actor isolated and callers hop to it.
@MainActor
final class PlaceSuggester: NSObject, MKLocalSearchCompleterDelegate {
  private let completer = MKLocalSearchCompleter()
  private var pending: CheckedContinuation<[[String: String]], Never>?
  /// The latest suggestions, so a pick can be looked up by its position.
  private var lastResults: [MKLocalSearchCompletion] = []

  override init() {
    super.init()
    completer.delegate = self
    completer.resultTypes = [.address, .pointOfInterest]
    // Favour the United Kingdom, where WakeWise plans journeys.
    completer.region = MKCoordinateRegion(
      center: CLLocationCoordinate2D(latitude: 54.5, longitude: -3.0),
      span: MKCoordinateSpan(latitudeDelta: 10, longitudeDelta: 10)
    )
  }

  func suggest(_ query: String) async -> [[String: String]] {
    // A newer query replaces the one still waiting.
    finish([])
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.count < 2 {
      lastResults = []
      return []
    }
    return await withCheckedContinuation { continuation in
      pending = continuation
      completer.queryFragment = trimmed
    }
  }

  func resolve(_ id: String) async throws -> [String: Any]? {
    guard let index = Int(id), lastResults.indices.contains(index) else { return nil }
    let request = MKLocalSearch.Request(completion: lastResults[index])
    let response = try await MKLocalSearch(request: request).start()
    guard let item = response.mapItems.first else { return nil }
    let placemark = item.placemark
    return [
      "name": item.name ?? lastResults[index].title,
      "area": placemark.locality ?? placemark.subAdministrativeArea ?? placemark.administrativeArea ?? "",
      "latitude": placemark.coordinate.latitude,
      "longitude": placemark.coordinate.longitude,
    ]
  }

  private func finish(_ results: [[String: String]]) {
    pending?.resume(returning: results)
    pending = nil
  }

  private func deliver(_ results: [MKLocalSearchCompletion]) {
    lastResults = results
    finish(results.enumerated().map { ["id": String($0.offset), "title": $0.element.title, "subtitle": $0.element.subtitle] })
  }

  nonisolated func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
    let results = Array(completer.results.prefix(6))
    Task { @MainActor in self.deliver(results) }
  }

  nonisolated func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
    Task { @MainActor in self.deliver([]) }
  }
}

@MainActor private let placeSuggester = PlaceSuggester()

public class WakeWisePlacesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WakeWisePlaces")

    AsyncFunction("suggest") { (query: String) async throws -> [[String: Any]] in
      let suggestions = await placeSuggester.suggest(query)
      return suggestions.map { $0 as [String: Any] }
    }

    AsyncFunction("resolve") { (id: String) async throws -> [String: Any]? in
      try await placeSuggester.resolve(id)
    }
  }
}
