<?php

/**
 * Menu entry for the plugin, added under "Administração" via the
 * menu_toadd hook. Clicking it opens the plugin's config screen.
 *
 * Legacy-style class name (PluginFaqSugestoesMenu) so GLPI 10's backward-compat
 * autoloader resolves it to inc/menu.class.php.
 */
class PluginFaqSugestoesMenu extends CommonGLPI
{
    /**
     * Label shown in the menu.
     */
    public static function getMenuName()
    {
        return 'Sugestões da Base de Conhecimento';
    }

    /**
     * Tabler icon used next to the menu label.
     */
    public static function getIcon()
    {
        return 'ti ti-book';
    }

    /**
     * Menu definition. Returns false (no entry) for users without the config
     * right, so the item only shows to those who can actually change settings.
     */
    public static function getMenuContent()
    {
        if (!Session::haveRight('config', UPDATE)) {
            return false;
        }

        return [
            'title' => self::getMenuName(),
            'page'  => Plugin::getWebDir('faq_sugestoes', false) . '/front/config.form.php',
            'icon'  => self::getIcon(),
        ];
    }
}
