var express = require('express');
var path = require ('path');
var logger = require ('morgan');
var bodyParser = require ('body-parser');
var neo4j = require('neo4j-driver').v1;
var app = express();


//View engine
app.set ('views',path.join(__dirname,'views'));
app.set('view engine','ejs');

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:false}));
app.use(express.static(path.join(__dirname,'public')));

var driver = neo4j.driver('bolt://localhost',neo4j.auth.basic('neo4j','sidney'));
var session=driver.session();

app.get('/add',function (req,res){
    session 
    .run('MATCH(t:transcript) return t limit 25')
    .then(function(result){
        var nodeArr =[];
        result.records.forEach(function(record) {
                nodeArr.push({
                    id: record._fields[0].identity.low,
                    name: record._fields[0].properties.name,
                    description: record._fields[0].properties.description,
                });
        }); 
        res.render('add',{movies: nodeArr});
    })
    .catch(function(err){
        console.log(err)
    })

});

/////////////////////////////////////
// Create new transcript and word map
/////////////////////////////////////
app.post('/transcript/add',function(req, res){
    var transcriptName = (req.body.transcript_name.trim());
    var transcriptDescription = (req.body.transcript_description.trim());
    var TranscriptWords = (req.body.transcript_text.trim());
    var TranscriptAuthor=(req.body.transcript_author.trim());

    var s = TranscriptWords;
    var punctuationless = s.replace(/'[.,\/#!$%?\^&\*;:{}=\-_`~()]/g,"");
    var finalTranscriptWords=punctuationless.replace(/'/g, "\#");
    var finalTranscriptWords2 = finalTranscriptWords.replace(/\s{2,}/g," ");

    var stopWords="'?','.',',','a','about','above','after','again','against','all','am','an','and','any','are','aren\\'t','as','at','be','because','been','before','being','below','between','both','but','by','can\\'t','cannot','could','couldn\\'t','did','didn\\'t','do','does','doesn\\'t','doing','don\\'t','down','during','each','few','for','from','further','had','hadn\\'t','has','hasn\\'t','have','haven\\'t','having','he','he\\'d','he\\'ll','he\\'s','her','here','here\\'s','hers','herself','him','himself','his','how','how\\'s','i','i\\'d','i\\'ll','i\\'m','i\\'ve','if','in','into','is','isn\\'t','it','it\\'s','its','itself','let\\'s','me','more','most','mustn\\'t','my','myself','no','nor','not','of','off','on','once','only','or','other','ought','our','ours','ourselves','out','over','own','same','shan\\'t','she','she\\'d','she\\'ll','she\\'s','should','shouldn\\'t','so','some','such','than','that','that\\'s','the','their','theirs','them','themselves','then','there','there\\'s','these','they','they\\'d','they\\'ll','they\\'re','they\\'ve','this','those','through','to','too','under','until','up','very','was','wasn\\'t','we','we\\'d','we\\'ll','we\\'re','we\\'ve','were','weren\\'t','what','what\\'s','when','when\\'s','where','where\\'s','which','while','who','who\\'s','whom','why','why\\'s','with','won\\'t','would','wouldn\\'t','you','you\\'d','you\\'ll','you\\'re','you\\'ve','your','yours','yourself','yourselves'";
   
   console.log("-----------------------");
   console.log("stopwords");
   console.log(stopWords);
   console.log("query:")
   console.log(finalTranscriptWords2);
   console.log("-----------------------");

    var WordImportQuery = "WITH split(tolower('" + finalTranscriptWords2 + "'), ' ') AS words ";
    WordImportQuery += "WITH [w in words WHERE NOT w IN ["+ stopWords +"]] AS text ";
    WordImportQuery+="UNWIND range (0,size(text)-2)as i ";
    WordImportQuery+="MERGE (w1:Word {name: text[i]}) ";
    WordImportQuery+="ON CREATE SET w1.count = 1 ON MATCH SET w1.count = w1.count +1 ";
    WordImportQuery+=" MERGE (w2:Word {name: text[i+1]}) ";
	WordImportQuery+="ON CREATE SET w2.count = 1 ON MATCH SET w2.count = w2.count +1 ";
    WordImportQuery+="MERGE (w1)-[r:NEXT]->(w2) ";
    WordImportQuery+="ON CREATE SET r.count = 1 ";
 	WordImportQuery+="ON MATCH SET r.count = r.count+1 ";
    WordImportQuery+="WITH w1,w2 ";
    WordImportQuery+="Match (p:transcript) ";
    WordImportQuery+="WHERE p.name='" + transcriptName + "' ";
    WordImportQuery+="MERGE (p)-[r1:INCLUDED]->(w1) ";
	WordImportQuery+="ON CREATE SET r1.count = 1 ";
	WordImportQuery+="ON MATCH SET r1.count = r1.count+1 ";
    WordImportQuery+="MERGE (p)-[r2:INCLUDED]->(w2) ";
    WordImportQuery+="	ON CREATE SET r2.count = 1 ";
	WordImportQuery+="ON MATCH SET r2.count = r2.count+1; ";
    
    var AuthorCreate = "MERGE (n:Person {name:'" + TranscriptAuthor + "'}); "; 

    var AuthorImport = "MATCH (t:transcript {name:'" + transcriptName + "'}) ";
    AuthorImport +="MATCH (p:Person {name:'"+ TranscriptAuthor + "'}) ";
    AuthorImport +="MERGE  (t)-[:AUTHOR]->(p) ";

//first create the transcript node    
session
    .run('CREATE (t:transcript {name:{transcriptParam},description:{descriptionParam},fulltext:{TranscriptTextParam}}) RETURN t.name', {transcriptParam:transcriptName,descriptionParam:transcriptDescription,TranscriptTextParam:TranscriptWords})
    .then(function (result){
        console.log("transcript created");
        console.log(WordImportQuery);
    })
    .catch(function(err){
        console.log(err);
    });

//Create the author
    session
    .run(AuthorCreate)
    .then(function (result){
        console.log("Author Created");

    })
    .catch(function(err){
        console.log(err);
    });

    //Connect the transcript to the author
    session

    .run (AuthorImport)
    .then (function (result){
        console.log("author relationship created")    
    })
    .catch(function(err){
        console.log(err);
    });

session
    .run(WordImportQuery)
    .then(function (result){
       console.log("imported words");
    })
    .catch(function(err){
        console.log(err);
    });

//run the clean queries
    session
    .run('match (w:Word) Where w.name CONTAINS "#" detach delete w')
    .then(function (result){
        console.log("clean-up script 1 completed");
    })
    .catch(function(err){
        console.log(err);
    });

session
    .run('MATCH (a:Word) WHERE size(a.name)<= 1 detach delete a')
    .then(function (result){
        console.log("clean-up script 2 completed");
        console.log("IMPORT COMPLETE")
        res.redirect('/');
        session.close();
    })
    .catch(function(err){
        console.log(err);
    });


});

app.get('/', function (req, res) {
    res.render('homepage')
})

app.get('/review', function (req, res) {
 session 
    .run('MATCH(t:transcript) return t')
    .then(function(result,returnVar){
        var nodeArr =[];
        result.records.forEach(function(record) {
                nodeArr.push({
                    id: record._fields[0].identity.low,
                    name: record._fields[0].properties.name,
                    description: record._fields[0].properties.description,
                });
        }); 
        res.render('review',{Transcripts: nodeArr});
    })
    .catch(function(err){
        console.log(err)
    })
})


app.get('/about', function (req, res) {
  res.render('about')
})


//grab the selected transcript name and build, run and return the results
app.post('/review2', function(req,res){
    //get the name of the transcript
    var transcriptName = (req.body.transcripts.trim());
    if (transcriptName=="AllTrans")
    {
        transcriptName = "All loaded Transcripts";
        TopWordsQuery ="match (w:Word) return  w.name as Word, w.count as Count order by w.count desc LIMIT 25";
        TopThemes ="MATCH p=(:Word)-[r:NEXT*1..3]->(:Word) WITH p WITH reduce(s=0,x IN relationships(p) | s + x.count) AS total, p WITH nodes(p) AS text, 1.0*total/size(nodes(p)) as weight RETURN extract(x IN text | x.name) AS phrase, weight ORDER BY weight DESC LIMIT 10";
    }
    else
    {
        TopWordsQuery ="match (t:transcript{name:'"+ transcriptName +"'})-[r:INCLUDED]-(w:Word) return w.name as Word, r.count as Count order by r.count desc LIMIT 25";
        TopThemes ="MATCH p=(:Word)-[r:NEXT*1..3]->(:Word) WITH p WITH reduce(s=0,x IN relationships(p) | s + x.count) AS total, p WITH nodes(p) AS text, 1.0*total/size(nodes(p)) as weight RETURN extract(x IN text | x.name) AS phrase, weight ORDER BY weight DESC LIMIT 10";
    }

var CountArr =[];
var ThemeArr =[];
session 
    .run(TopWordsQuery)
    .then(function(result){
        result.records.forEach(function(record) {
                CountArr.push({
                    word: record.get(0),
                    count: record.get(1)
                });
        }); 
    })
    .catch(function(err){
        console.log(err)
    })   

    session 
    .run(TopThemes)
    .then(function(result){
        result.records.forEach(function(record) {
                ThemeArr.push({
                    phrase: record.get(0),
                    weight: record.get(1)
                });
        }); 
        res.render('review2', {
            transcriptNameReview : transcriptName,
            Themes : ThemeArr,
            WordsList: CountArr
        });
    })
    .catch(function(err){
        console.log(err)
    })  
});



app.listen(3000, function (){console.log('server started on 3000')});
module.exports= app;