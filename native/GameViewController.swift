
// MARK: - PokéPath TD game view controller
// Appended to AppDelegate.swift by native/configure-ios.sh, and set as the
// storyboard's root view controller in place of CAPBridgeViewController.
class GameViewController: CAPBridgeViewController {

    // The status bar and home indicator are hidden by Capacitor's SystemBars
    // plugin ("plugins.SystemBars.hidden" in capacitor.config.json).

    // Edge swipes need a second swipe, so dragging Pokémon near the screen
    // edges doesn't accidentally open Control Center / go home.
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        let background = UIColor(red: 17.0 / 255.0, green: 17.0 / 255.0, blue: 17.0 / 255.0, alpha: 1.0)
        view.backgroundColor = background
        webView?.backgroundColor = background
        webView?.scrollView.backgroundColor = background
        webView?.scrollView.bounces = false
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
        setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
    }
}
