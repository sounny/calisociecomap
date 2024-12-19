(function() {
    // Pseudo-global variables
    var attrArray = ["Median income per household", "Mean income per household", "Population", "GDP in Thousands of Chained Dollars", "Average Monthly Unemployment"];
    console.log("attrArray: ", attrArray);

    var expressed = attrArray[1]; // Initial attribute
    console.log("expressed attribute: ", expressed);

    // Begin script when window loads
    window.onload = setMap;

    function setMap() {
        // Map frame dimensions
        var width = window.innerWidth * 0.5,
            height = 800;
    
        var zoom = d3.zoom()
            .scaleExtent([1, 8])
            .on("zoom", zoomed);
    
        var svg = d3.select("body")
            .append("svg")
            .attr("class", "map")
            .attr("width", width)
            .attr("height", height)
            .call(zoom)
            .on("click", reset);
    
        var map = svg.append("g");
    
        // Create custom conic equal area projection
        var projection = d3.geoConicEqualArea()
            .parallels([33, 45])
            .scale(5500)
            .translate([-270, 780])
            .rotate([120, 0])
            .center([-10, 34]);
    
        // Create a path generator using the projection
        var path = d3.geoPath().projection(projection);
        console.log("path: ", path);
    
        // Use Promise.all to parallelize asynchronous data loading
        var promises = [];
        promises.push(d3.csv("data/Cali_County_Data.csv")); // Load attributes from CSV
        promises.push(d3.json("data/Surrounding_Cali_States_Provinces.topojson")); // Load surrounding states spatial data
        promises.push(d3.json("data/California_Counties.topojson")); // Load California counties spatial data
        Promise.all(promises).then(callback).catch(function(error) {
            console.error("Error loading data: ", error);
        });
    
        function callback(data) {
            var csvData = data[0],
                caliCounties = data[2],
                surrounding = data[1];
    
            console.log("csvData: ", csvData);
            console.log("California Counties topojson: ", caliCounties);
            console.log("Surrounding States topojson: ", surrounding);
    
            // Translate TopoJSONs back to GeoJSON
            var californiaCounties = topojson.feature(caliCounties, caliCounties.objects.California_Counties).features;
            var surroundingStates = topojson.feature(surrounding, surrounding.objects.Surrounding_Cali_States_Provinces).features;
    
            // Call functions with the loaded data
            setGraticule(map, path, surroundingStates);
            joinData(californiaCounties, csvData);
            var colorScale = makeColorScale(californiaCounties);
            setEnumerationUnits(californiaCounties, map, path, colorScale);
            
            // Add coordinated visualization to the map
            setChart(csvData, colorScale, expressed);
    
            // Attach the clicked function to the counties with path as an argument
            map.selectAll(".counties")
                .data(californiaCounties)
                .enter().append("path")
                .attr("class", "counties")
                .attr("d", path)
                .on("click", function(event, d) { clicked(event, d, path); });
        }
    
        function zoomed(event) {
            const {transform} = event;
            map.attr("transform", transform);
            map.attr("stroke-width", 1 / transform.k);
        }
    
        function reset() {
            map.selectAll(".counties").transition().style("fill", null);
            svg.transition().duration(750).call(
                zoom.transform,
                d3.zoomIdentity,
                d3.zoomTransform(svg.node()).invert([width / 2, height / 2])
            );
        }
    }; //end of setMap
    
    // Define the clicked function outside of setMap
    function clicked(event, d) {

        const [[x0, y0], [x1, y1]] = path.bounds(d);
        event.stopPropagation();
        d3.selectAll(".counties").transition().style("fill", null);
        d3.select(this).transition().style("fill", "red");
        d3.select("svg").transition().duration(750).call(
            zoom.transform,
            d3.zoomIdentity
                .translate(width / 2, height / 2)
                .scale(Math.min(8, 0.9 / Math.max((x1 - x0) / width, (y1 - y0) / height)))
                .translate(-(x0 + x1) / 2, -(y0 + y1) / 2),
            d3.pointer(event, d3.select("svg").node())
        );
    }
    
    

    // Function to create color scale generator
    function makeColorScale(data){
        var colorClasses = [
            "#D4B9DA",
            "#C994C7",
            "#DF65B0",
            "#DD1C77",
            "#980043"
        ];

        // Create color scale generator
        var colorScale = d3.scaleThreshold()
            .range(colorClasses);

        // Build array of all values of the expressed attribute
        var domainArray = [];
        for (var i = 0; i < data.length; i++) {
            var val = parseFloat(data[i].properties[expressed]);
            domainArray.push(val);
        };

        // Cluster data using ckmeans clustering algorithm to create natural breaks
        var clusters = ss.ckmeans(domainArray, 5);
        // Reset domain array to cluster minimums
        domainArray = clusters.map(function(d){
            return d3.min(d);
        });
        // Remove first value from domain array to create class breakpoints
        domainArray.shift();

        // Assign array of last 4 cluster minimums as domain
        colorScale.domain(domainArray);

        return colorScale;        
    };

    function setGraticule(map, path, surroundingStates) {
        // Create graticule generator
        var graticule = d3.geoGraticule()
            .step([5, 5]); // Place graticule lines every 5 degrees of longitude and latitude

        // Create graticule background
        var gratBackground = map.append("path")
            .datum(graticule.outline()) // Bind graticule background
            .attr("class", "gratBackground") // Assign class for styling
            .attr("d", path); // Project graticule

        // Create graticule lines
        var gratLines = map.selectAll(".gratLines") // Select graticule elements that will be created
            .data(graticule.lines()) // Bind graticule lines to each element to be created
            .enter() // Create an element for each datum
            .append("path") // Append each element to the SVG as a path element
            .attr("class", "gratLines") // Assign class for styling
            .attr("d", path); // Project graticule lines

        var states = map.selectAll(".states")
            .data(surroundingStates)
            .enter()
            .append("path")
            .attr("class", function(d) {
                return "states " + d.properties.name; // Name of the name field is "name"
            })
            .attr("d", path);
    }

    function joinData(californiaCounties, csvData) {
        for (var i = 0; i < csvData.length; i++) {
            var csvRegion = csvData[i]; // The current county
            var csvKey = csvRegion.California_County; // The CSV primary key

            for (var a = 0; a < californiaCounties.length; a++) {
                var geojsonProps = californiaCounties[a].properties; // The current county geojson properties
                var geojsonKey = geojsonProps.NAME_ALT; // The geojson primary key

                // Where primary keys match, transfer CSV data to geojson properties object
                if (geojsonKey == csvKey) {
                    // Assign all attributes and values
                    attrArray.forEach(function(attr) {
                        var val = parseFloat(csvRegion[attr]); // Get CSV attribute value
                        geojsonProps[attr] = val; // Assign attribute and value to geojson properties
                    });
                }
                //console.log("test:",geojsonProps);
            }
        }
    };

    function setEnumerationUnits(californiaCounties, map, path, colorScale){
        // Add California counties to map
        var counties = map.selectAll(".counties")
            .data(californiaCounties) // Pass in the reconverted GeoJSON
            .enter()
            .append("path")
            .attr("class", function(d) {
                return "counties " + d.properties.NAME_ALT;
            })
            .attr("d", path)
            .style("fill", function(d) {
                return colorScale(d.properties[expressed]);
            })
            .on("click", clicked); //Add click event listener

        console.log("Converted GeoJSON features: ", californiaCounties);
    };

    // Function to create coordinated bar chart
    function setChart(csvData, colorScale, expressed){
        // Chart frame dimensions
        var chartWidth = window.innerWidth * 0.425,
            chartHeight = 500,
            leftPadding = 50,  // Increased left padding
            rightPadding = 2,
            topBottomPadding = 5,
            chartInnerWidth = chartWidth - leftPadding - rightPadding,
            chartInnerHeight = chartHeight - topBottomPadding * 2,
            translate = "translate(" + leftPadding + "," + topBottomPadding + ")";

        // Create a second svg element to hold the bar chart
        var chart = d3.select("body")
            .append("svg")
            .attr("width", chartWidth)
            .attr("height", chartHeight)
            .attr("class", "chart");

        // Create a rectangle for chart background fill
        var chartBackground = chart.append("rect")
            .attr("class", "chartBackground")
            .attr("width", chartInnerWidth)
            .attr("height", chartInnerHeight)  // Match chartBackground height to chartInnerHeight
            .attr("transform", translate);

        // Create a scale to size bars proportionally to frame and for axis
        var yScale = d3.scaleLinear()
            .range([chartInnerHeight, 20])  // Adjusted range to match inner height
            .domain([0, d3.max(csvData, function(d) { return parseFloat(d[expressed]); })]);

        // Set bars for each province
        var bars = chart.selectAll(".bar")
            .data(csvData)
            .enter()
            .append("rect")
            .sort(function(a, b){
                return a[expressed] - b[expressed];
            })
            .attr("class", function(d){
                return "bar " + d.adm1_code;
            })
            .attr("width", chartInnerWidth / csvData.length - 1)  // Adjusted width calculation
            .attr("x", function(d, i){
                return i * (chartInnerWidth / csvData.length) + leftPadding;
            })
            .attr("height", function(d){
                return chartInnerHeight - yScale(parseFloat(d[expressed]));  // Adjusted height calculation
            })
            .attr("y", function(d){
                return yScale(parseFloat(d[expressed])) + 5;  // Adjusted y position
            })
            .style("fill", function(d){
                return colorScale(d[expressed]);
            });

        // Create a text element for the chart title
        var chartTitle = chart.append("text")
            .attr("x", 100)
            .attr("y", 40)
            .attr("class", "chartTitle")
            .text(expressed);

        // Create vertical axis generator
        var yAxis = d3.axisLeft()
            .scale(yScale)
            .tickFormat(d3.format(".0f"));  // Format ticks as integers

        // Place axis
        var axis = chart.append("g")
            .attr("class", "axis")
            .attr("transform", translate)
            .call(yAxis);

        // Create frame for chart border
        var chartFrame = chart.append("rect")
            .attr("class", "chartFrame")
            .attr("width", chartInnerWidth)
            .attr("height", chartInnerHeight)
            .attr("transform", translate);
    };

})();
