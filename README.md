# Lernkartei

Karteikarten für den NaWi-Unterricht, direkt im Browser. Das Repo ist die
Website. Eine Datei, die Sie hier ablegen, ist nach etwa zwei Minuten live.

## Eine neue Themengruppe hinzufügen

1. Öffnen Sie den Ordner `decks/` hier auf GitHub.
2. Klicken Sie auf **Add file**, dann auf **Upload files**.
3. Ziehen Sie Ihre Datei hinein und klicken Sie auf **Commit changes**.
4. Warten Sie etwa zwei Minuten. Danach steht die neue Kachel auf der
   Startseite.

Mehr ist nicht zu tun. Die Liste der Decks entsteht von selbst. Bearbeiten
Sie `decks/index.json` nicht von Hand.

Der Name der Datei ist der Name des Speicherplatzes für den Fortschritt. Der
Titel auf der Kachel kommt dagegen aus der Datei selbst, aus dem zweiten
Argument Ihrer Karten.

## Wie die Datei aussehen muss

Speichern Sie als **reinen Text** mit der Endung **`.tex`**. Endungen `.txt`
und `.rtf` gehen auch, aber nur, wenn der Inhalt reiner Text ist.

Speichern Sie nicht als Rich Text. Das macht zum Beispiel TextEdit auf dem
Mac ohne Nachfrage. In TextEdit hilft **Format > In reinen Text umwandeln**
vor dem Speichern. Die App sagt Ihnen, wenn eine Datei als Rich Text
gespeichert ist.

Der Inhalt bleibt genau Ihre LaTeX-Datei, also die Datei, aus der Sie auch
die Papierkarten drucken. Jede Karte steht zweimal darin:

```latex
\frontcard{188}{Kernphysik}{Beschreibe den Aufbau eines Atoms.}
\backcard{188}{Kernphysik}{Ein Atom besteht aus kleinem Kern mit ...}
```

Die Zahl am Anfang verbindet Vorder- und Rückseite. Die Reihenfolge in der
Datei ist egal.

## Damit Formeln erscheinen

Schreiben Sie Formeln wie bisher, mit `\( ... \)` im Text und `\[ ... \]` für
eine abgesetzte Zeile. Die App zeigt sie mit KaTeX an. Chemie mit `\ce{...}`
funktioniert ebenfalls.

Eine Formel, die KaTeX nicht versteht, erscheint rot. Der Rest der Karte
bleibt lesbar.

## Wenn eine Kachel als fehlerhaft markiert ist

Auf der Kachel steht dann, was nicht stimmt. Es gibt drei Fälle:

- **Als Rich Text gespeichert.** Speichern Sie die Datei noch einmal als
  reinen Text und laden Sie sie erneut hoch.
- **Keine Karten gefunden.** In der Datei fehlt `\begin{document}`, oder es
  steht kein `\frontcard` darin.
- **Datei nicht erreichbar.** Laden Sie die Seite neu. Bleibt es dabei, ist
  die Datei nicht im Ordner `decks/` angekommen.

Fehlt einer Karte die Rückseite, verschwindet nicht das ganze Deck. Die App
zeigt beim Start einen kleinen Hinweis, und die Karte bleibt weg.

## Bedienung

Karte antippen dreht sie um. Die beiden Knöpfe werden erst aktiv, wenn Sie
die Lösung gesehen haben. Über das Zahnrad stellen Sie ein, wie oft Sie eine
Karte wissen müssen, in welcher Reihenfolge die Karten kommen und ob die
Ansicht hell oder dunkel ist.

Der Fortschritt bleibt im Browser gespeichert, auch nach dem Schließen. Die
App läuft nach dem ersten Besuch auch ohne Internet.
