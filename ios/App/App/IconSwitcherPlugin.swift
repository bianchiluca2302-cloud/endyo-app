import UIKit
import Capacitor

@objc(IconSwitcherPlugin)
public class IconSwitcherPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IconSwitcherPlugin"
    public let jsName = "IconSwitcher"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setIcon", returnType: CAPPluginReturnPromise)
    ]

    @objc func setIcon(_ call: CAPPluginCall) {
        let accent = call.getString("accent") ?? "amber"
        let isDark = call.getBool("dark") ?? false
        let theme = isDark ? "dark" : "light"
        let iconName = "icon_\(accent)_\(theme)"

        DispatchQueue.main.async {
            guard UIApplication.shared.supportsAlternateIcons else {
                call.resolve()
                return
            }
            UIApplication.shared.setAlternateIconName(iconName) { _ in
                call.resolve()
            }
        }
    }
}
